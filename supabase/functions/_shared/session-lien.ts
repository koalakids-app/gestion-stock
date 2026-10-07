// Session courte pour les pages publiques ouvertes par un lien (familles,
// stagiaires, salarié(e)s sans compte...).
// ============================================================================
// Le lien (?t=jeton) ne sert qu'à OUVRIR une session : la page l'échange contre
// une session signée (action 'ouvrir'), puis ne renvoie plus que celle-ci.
//   - inactivité : la session meurt si elle n'est pas prolongée pendant
//     INACTIVITE_S (+ une marge pour les horloges et le réseau) ;
//   - durée maximale : DUREE_MAX_S depuis l'ouverture, quoi qu'il arrive ;
//   - liée à UNE fonction : une session ouverte sur dossier-pieces ne vaut rien
//     sur dossier-famille.
// Passé l'un de ces délais, seul un nouveau clic sur le lien d'origine rouvre
// une session — tant que le lien lui-même n'a pas expiré.
//
// Sans état : la session est signée (HMAC-SHA-256) avec une clé dérivée de
// SUPABASE_SERVICE_ROLE_KEY, qui n'est jamais exposée. Aucune table, aucun
// secret supplémentaire. Le jeton du lien n'est PAS validé ici : chaque
// fonction continue de le contrôler en base à chaque appel, comme avant.
//
// Doit rester aligné avec js/session-lien.js (délai d'inactivité côté page).
//
// Utilisation, tout en haut du traitement de la requête :
//   const r = await resoudreJeton(body, "nom-de-la-fonction");
//   if ("reponse" in r) return r.reponse;   // ouvrir / prolonger / refus
//   const token = r.token;                  // jeton du lien, comme avant
// ============================================================================

export const INACTIVITE_S = 15 * 60;
export const DUREE_MAX_S = 2 * 60 * 60;
const MARGE_S = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function rep(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const enc = new TextEncoder();
const b64u = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deb64u = (s: string) => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
};

let clePromise: Promise<CryptoKey> | null = null;
function cle() {
  clePromise ??= crypto.subtle.importKey(
    "raw",
    enc.encode("session-lien:v1:" + (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return clePromise;
}

type Charge = { t: string; f: string; i: number; a: number };

async function signer(c: Charge) {
  const corps = b64u(enc.encode(JSON.stringify(c)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await cle(), enc.encode(corps)));
  return corps + "." + b64u(sig);
}

async function lire(session: string): Promise<Charge | null> {
  try {
    const [corps, sig] = session.split(".");
    if (!corps || !sig) return null;
    const ok = await crypto.subtle.verify("HMAC", await cle(), deb64u(sig), enc.encode(corps));
    if (!ok) return null;
    const c = JSON.parse(new TextDecoder().decode(deb64u(corps)));
    return typeof c.t === "string" && typeof c.f === "string" &&
        Number.isFinite(c.i) && Number.isFinite(c.a)
      ? c as Charge
      : null;
  } catch {
    return null;
  }
}

async function emettre(token: string, fn: string, ouverteLe: number) {
  const maintenant = Date.now();
  return {
    session: await signer({ t: token, f: fn, i: ouverteLe, a: maintenant }),
    inactivite_s: INACTIVITE_S,
    fin_max: ouverteLe + DUREE_MAX_S * 1000,
  };
}

export async function resoudreJeton(
  body: Record<string, unknown>,
  fn: string,
): Promise<{ token: string } | { reponse: Response }> {
  const action = String(body.action || "");

  if (action === "ouvrir") {
    const token = String(body.token || "").trim();
    if (!token || token.length > 200) return { reponse: rep({ erreur: "jeton_manquant" }, 400) };
    return { reponse: rep(await emettre(token, fn, Date.now())) };
  }

  const session = String(body.session || "");
  if (!session) return { reponse: rep({ erreur: "session_requise" }, 401) };
  const c = await lire(session);
  if (!c || c.f !== fn) return { reponse: rep({ erreur: "session_requise" }, 401) };
  const maintenant = Date.now();
  if (
    maintenant - c.a > (INACTIVITE_S + MARGE_S) * 1000 ||
    maintenant - c.i > DUREE_MAX_S * 1000
  ) {
    return { reponse: rep({ erreur: "session_terminee" }, 401) };
  }

  if (action === "prolonger") return { reponse: rep(await emettre(c.t, fn, c.i)) };
  return { token: c.t };
}
