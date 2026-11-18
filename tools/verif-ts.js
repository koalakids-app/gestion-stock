#!/usr/bin/env node
/*
 * Vérifie la SYNTAXE des fichiers TypeScript des edge functions (pas les types : les imports Deno
 * https://… ne sont pas résolus ici). Usage : node tools/verif-ts.js  (typescript doit être installé :
 * npm i --no-save typescript). Code de sortie 1 si un fichier est invalide.
 */
const ts = require('typescript'), fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const files = execSync('git ls-files "supabase/**/*.ts"', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
let bad = 0;
for (const f of files) {
  const r = ts.transpileModule(fs.readFileSync(path.join(ROOT, f), 'utf8'),
    { reportDiagnostics: true, fileName: f, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  if (r.diagnostics.length) {
    bad++;
    console.log('✗ ' + f);
    r.diagnostics.forEach(d => console.log('    ' + ts.flattenDiagnosticMessageText(d.messageText, '\n')));
  }
}
console.log((files.length - bad) + '/' + files.length + ' fichiers TypeScript sans erreur de syntaxe');
process.exit(bad ? 1 : 0);
