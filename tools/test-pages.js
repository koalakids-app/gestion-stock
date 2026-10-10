#!/usr/bin/env node
/*
 * Test de chargement de toutes les pages HTML, en local.
 *
 * Usage :
 *   npm i -D playwright && npx playwright install chromium   (une seule fois)
 *   node tools/test-pages.js                 # toutes les pages
 *   node tools/test-pages.js demandes stock  # seulement celles dont le chemin contient ces mots
 *
 * Pour chaque page : charge-la avec un faux Supabase (aucune donnée réelle n'est lue ni
 * modifiée : toute requête vers supabase.co est bloquée) et signale
 *   - les erreurs JavaScript (ReferenceError, SyntaxError, ...)
 *   - les erreurs console
 *   - les fichiers locaux introuvables (404 sur js/, css/, images...)
 * Code de sortie 1 si au moins une page pose problème.
 * Les pages qui demandent une connexion restent sur l'écran de connexion : ce test
 * vérifie que le code se charge, pas les parcours (voir la liste manuelle).
 */
const http = require('http'), fs = require('fs'), path = require('path'), { execSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('Playwright manquant : npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const filters = process.argv.slice(2);

// Faux client Supabase : toute méthode renvoie un objet inerte, les listes sont vides.
const STUB = `(function(){
  var mk=function(){var f=function(){};return new Proxy(f,{
    get:function(t,k){if(k==='then'||k===Symbol.toPrimitive||k===Symbol.iterator)return undefined;
      if(k==='data')return [];if(k==='error')return null;if(k==='length')return 0;return mk();},
    apply:function(){return mk();},construct:function(){return mk();}});};
  window.supabase={createClient:function(){return mk();}};
})();`;

const pages = execSync('git ls-files "*.html"', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter(p => !filters.length || filters.some(f => p.toLowerCase().includes(f.toLowerCase())));

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); }
        else { res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data); }
      });
    }).listen(0, () => resolve(srv));
  });
}

(async () => {
  const srv = await serve(), base = 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch();
  let bad = 0;
  for (const pg of pages) {
    const ctx = await browser.newContext(), page = await ctx.newPage();
    const problems = new Set();
    page.on('pageerror', e => problems.add('JS    ' + String(e.message).split('\n')[0].slice(0, 160)));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.add('CONSOLE ' + m.text().split('\n')[0].slice(0, 160)); });
    page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) problems.add('404   ' + r.url().slice(base.length)); });
    await page.route('**/*', r => {
      const u = r.request().url();
      if (u.startsWith(base)) return r.continue();
      if (/supabase-js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      if (/supabase\.(co|in)/.test(u)) return r.abort();   // jamais de vraies données
      return r.continue();                                  // bibliothèques CDN (xlsx, jspdf...)
    });
    await page.addInitScript(STUB);
    try {
      await page.goto(base + '/' + pg, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(1500);
    } catch (e) { problems.add('CHARGEMENT ' + e.message.split('\n')[0]); }
    if (problems.size) { bad++; console.log('✗ ' + pg); problems.forEach(p => console.log('    ' + p)); }
    else console.log('✓ ' + pg);
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log('\n' + (pages.length - bad) + '/' + pages.length + ' pages sans problème');
  process.exit(bad ? 1 : 0);
})();
