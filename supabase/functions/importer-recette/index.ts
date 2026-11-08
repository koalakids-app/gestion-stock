// Edge function "importer-recette"
// ============================================================================
// Lit la page d'une recette en ligne (URL collée par le référent) et en extrait
// les données structurées schema.org « Recipe » (JSON-LD), publiées par la plupart
// des sites de recettes : nom, portions, ingrédients (texte brut), préparation.
// Rien n'est enregistré ici : le navigateur pré-remplit le formulaire de recette
// (js/pages/demandes/22-idees-recettes-familles.js) que le référent relit et corrige.
// Appelée avec le JWT de l'utilisateur connecté (référent ou direction).
// Garde-fous (la fonction va chercher une adresse fournie par l'utilisateur) :
// https seulement, pas d'adresse IP ni de nom interne, résolution DNS refusée si
// elle pointe vers un réseau privé, redirections suivies à la main (3 max, mêmes
// contrôles), délai de 8 s, 2 Mo lus au plus.
// DÉPLOIEMENT : supabase functions deploy importer-recette (JWT activé, pas de secret).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MAX_OCTETS = 2_000_000;

function ipPrivee(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => isNaN(n))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

async function urlPermise(u: URL): Promise<boolean> {
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (u.port && u.port !== "443") return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return false;
  // Résolution DNS indisponible sur certains runtimes : on s'en tient alors aux contrôles sur le nom.
  if (typeof Deno.resolveDns !== "function") return true;
  try {
    const a = await Deno.resolveDns(h, "A").catch(() => [] as string[]);
    const aaaa = await Deno.resolveDns(h, "AAAA").catch(() => [] as string[]);
    const ips = [...a, ...aaaa];
    return ips.length > 0 && !ips.some(ipPrivee);
  } catch {
    return false;
  }
}

async function telecharger(depart: string): Promise<{ html: string; url: string }> {
  let url = new URL(depart);
  for (let i = 0; i <= 3; i++) {
    if (!(await urlPermise(url))) throw new Error("adresse_refusee");
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    let r: Response;
    try {
      r = await fetch(url, {
        redirect: "manual", signal: ctl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; KoalaKidsRecettes/1.0)", "Accept": "text/html,application/xhtml+xml", "Accept-Language": "fr" },
      });
    } finally { clearTimeout(t); }
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      if (!loc) throw new Error("page_illisible");
      url = new URL(loc, url);
      continue;
    }
    if (!r.ok) throw new Error("page_inaccessible");
    const type = r.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml/i.test(type)) throw new Error("page_illisible");
    const lecteur = r.body?.getReader();
    if (!lecteur) throw new Error("page_illisible");
    const morceaux: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await lecteur.read();
      if (done) break;
      total += value.length;
      if (total > MAX_OCTETS) { await lecteur.cancel(); break; }
      morceaux.push(value);
    }
    const buf = new Uint8Array(Math.min(total, MAX_OCTETS));
    let o = 0;
    for (const m of morceaux) { buf.set(m.subarray(0, buf.length - o), o); o += m.length; if (o >= buf.length) break; }
    return { html: new TextDecoder("utf-8").decode(buf), url: url.toString() };
  }
  throw new Error("trop_de_redirections");
}

const decoder: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };
const dec = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => decoder[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const net = (s: unknown) => dec(String(s ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

// deno-lint-ignore no-explicit-any
function chercherRecipe(noeud: any): any | null {
  if (!noeud || typeof noeud !== "object") return null;
  if (Array.isArray(noeud)) {
    for (const n of noeud) { const r = chercherRecipe(n); if (r) return r; }
    return null;
  }
  const t = noeud["@type"];
  if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return noeud;
  if (noeud["@graph"]) return chercherRecipe(noeud["@graph"]);
  return null;
}

// deno-lint-ignore no-explicit-any
function etapes(instr: any): string {
  const out: string[] = [];
  // deno-lint-ignore no-explicit-any
  const parcourir = (x: any) => {
    if (!x) return;
    if (typeof x === "string") { const t = net(x); if (t) out.push(t); return; }
    if (Array.isArray(x)) { x.forEach(parcourir); return; }
    if (x.itemListElement) { parcourir(x.itemListElement); return; }
    if (x.text) { const t = net(x.text); if (t) out.push(t); return; }
    if (x.name) { const t = net(x.name); if (t) out.push(t); }
  };
  parcourir(instr);
  return out.map((t, i) => `${i + 1}. ${t.replace(/^\d+[.)]\s*/, "")}`).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { url?: string };
  try { body = await req.json(); } catch { return json({ error: "corps_invalide" }, 400); }
  const brut = String(body.url || "").trim();
  if (!brut || brut.length > 500) return json({ error: "adresse_invalide" }, 400);
  let depart: URL;
  try { depart = new URL(/^https?:\/\//i.test(brut) ? brut : "https://" + brut); } catch { return json({ error: "adresse_invalide" }, 400); }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(jwt);
    if (!u?.user) return json({ error: "non_autorise" }, 401);
    const { data: ref } = await sb.from("referents").select("id").eq("user_id", u.user.id).maybeSingle();
    if (!ref) return json({ error: "non_autorise" }, 403);

    const { html, url } = await telecharger(depart.toString());
    let recette = null;
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && !recette) {
      try { recette = chercherRecipe(JSON.parse(m[1].trim())); } catch { /* bloc JSON invalide : suivant */ }
    }
    if (!recette) return json({ error: "recette_introuvable" }, 422);

    const ingredients: string[] = (Array.isArray(recette.recipeIngredient) ? recette.recipeIngredient : [])
      .map((i: unknown) => net(i)).filter(Boolean).slice(0, 60);
    if (!ingredients.length) return json({ error: "recette_introuvable" }, 422);
    const rendement = Array.isArray(recette.recipeYield) ? recette.recipeYield.join(" ") : String(recette.recipeYield ?? "");
    const portions = parseInt((rendement.match(/\d+/) || [""])[0], 10) || null;

    return json({
      nom: net(recette.name).slice(0, 120),
      portions,
      ingredients,
      etapes: etapes(recette.recipeInstructions).slice(0, 6000),
      source: url,
    });
  } catch (e) {
    const code = (e as Error).message;
    const connus = ["adresse_refusee", "page_illisible", "page_inaccessible", "trop_de_redirections"];
    if (connus.includes(code)) return json({ error: code }, 422);
    console.error("[importer-recette]", e);
    return json({ error: "erreur_interne" }, 500);
  }
});
