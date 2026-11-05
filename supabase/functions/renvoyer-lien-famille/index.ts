// Edge function "renvoyer-lien-famille"
// ============================================================================
// Publique (aucune session) : une famille qui a perdu son lien saisit son adresse
// e-mail sur espace-famille.html ; si elle correspond à un parent connu (enfants_parents)
// ayant un accès actif, elle reçoit CE lien (et son code) à CETTE adresse.
//
//   • La réponse est toujours la même (« si l'adresse est connue… »), adresse connue ou non :
//     on ne révèle pas quelles adresses existent.
//   • L'e-mail n'est jamais envoyé ailleurs qu'à l'adresse saisie, et seulement si elle est
//     celle d'un parent. Un accès révoqué n'est jamais renvoyé.
//   • Limites : 3 demandes / heure / adresse (silencieux) et 10 / heure / IP (429).
//     Journal : famille_renvois (empreinte de l'adresse). sql/espace_famille_renvoi_lien.sql.
//
// VARIABLES : GMAIL_USER, GMAIL_APP_PASSWORD, APP_URL.
// Déploiement : supabase functions deploy renvoyer-lien-famille --no-verify-jwt
// ============================================================================
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const PAR_ADRESSE = 3;
const PAR_IP = 10;
const REPONSE_FAMILLE = "a.janin@koalakids.fr";
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

const esc = (s: unknown) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Sujet en ASCII pur (voir envoyer-contrat-signe : denomailer coupe les sujets accentués).
const sujetAscii = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[—–]/g, "-")
    .replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim() || "Notification";

async function empreinte(v: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erreur: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ erreur: "corps_invalide" }, 400); }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return json({ erreur: "adresse_invalide" }, 400);

  const sb: any = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } });
  const ip = (req.headers.get("x-forwarded-for") || "inconnue").split(",")[0].trim();
  const hash = await empreinte(email);
  const depuis = new Date(Date.now() - 3600000).toISOString();

  const [{ count: parIp }, { count: parMail }] = await Promise.all([
    sb.from("famille_renvois").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", depuis),
    sb.from("famille_renvois").select("id", { count: "exact", head: true }).eq("email_hash", hash).gte("created_at", depuis),
  ]);
  if ((parIp ?? 0) >= PAR_IP) return json({ erreur: "trop_d_essais" }, 429);
  await sb.from("famille_renvois").insert({ ip, email_hash: hash });
  const reponse = json({ ok: true });
  if ((parMail ?? 0) >= PAR_ADRESSE) return reponse;   // trop de demandes pour cette adresse : silence

  try {
    // Parents portant cette adresse (casse ignorée, jokers LIKE neutralisés), puis égalité stricte.
    const motif = email.replace(/[\\%_]/g, "\\$&");
    const { data: pars } = await sb.from("enfants_parents").select("id, email").ilike("email", motif);
    const ids = (pars || []).filter((p: any) => String(p.email || "").trim().toLowerCase() === email).map((p: any) => p.id);
    if (!ids.length) return reponse;

    const { data: acces } = await sb.from("famille_acces")
      .select("code, enfant_id, creche_id").in("parent_id", ids).eq("actif", true);
    if (!acces?.length) return reponse;

    const enfIds = [...new Set(acces.map((a: any) => a.enfant_id))];
    const { data: enfs } = await sb.from("enfants").select("id, prenom").in("id", enfIds);
    const prenom = new Map((enfs || []).map((e: any) => [e.id, e.prenom || ""]));
    const { data: etab } = await sb.from("etablissements").select("raison_sociale")
      .eq("creche_id", acces[0].creche_id).maybeSingle();
    const enseigne = String(etab?.raison_sociale || "Koala Kids");

    const base = (Deno.env.get("APP_URL") || "https://koalakids-app.github.io/gestion-stock/").replace(/\/?$/, "/");
    const blocs = acces.map((a: any) => `
    <div style="margin:0 0 12px;padding:14px 16px;background:#F4F2FB;border-radius:12px;font-size:14.5px;line-height:1.6">
      ${prenom.get(a.enfant_id) ? `<strong>Espace famille de ${esc(prenom.get(a.enfant_id))}</strong><br>` : ""}
      Votre code personnel : <strong style="font-size:18px;letter-spacing:.15em">${esc(a.code)}</strong><br>
      <a href="${esc(base)}espace-famille.html?t=${esc(a.code)}" style="color:#4A3F9F;font-weight:700">Ouvrir mon espace famille</a>
    </div>`).join("");
    const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#FDF8F2;font-family:Helvetica,Arial,sans-serif;color:#2B2740">
<div style="max-width:560px;margin:0 auto;padding:24px 18px">
  <div style="background:#4A3F9F;color:#fff;padding:18px 20px;border-radius:16px 16px 0 0">
    <div style="font-size:21px;font-weight:800">${esc(enseigne)}</div>
    <div style="font-size:14px;opacity:.85;margin-top:2px">Votre lien vers l'espace famille</div>
  </div>
  <div style="background:#fff;border:2px solid #EFE9F5;border-top:none;border-radius:0 0 16px 16px;padding:22px 20px">
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">Bonjour,</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6">Vous avez demandé à retrouver votre lien. Le voici :</p>
    ${blocs}
    <p style="margin:12px 0 0;font-size:13px;color:#78748C;line-height:1.6">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message.</p>
  </div>
  <p style="text-align:center;font-size:12px;color:#8E8AA8;margin:16px 0 0">${esc(enseigne)} · ${REPONSE_FAMILLE}</p>
</div></body></html>`;

    const user = Deno.env.get("GMAIL_USER"), pass = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!user || !pass) { console.error("[renvoyer-lien-famille] Gmail non configuré"); return reponse; }
    const client = new SMTPClient({ connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: user, password: pass } } });
    try {
      await client.send({
        from: `Koala Kids <${user}>`, to: [email], replyTo: REPONSE_FAMILLE,
        subject: sujetAscii("Votre lien vers l'espace famille"),
        content: "Ce message nécessite un client de messagerie compatible HTML.", html,
      });
    } finally { await client.close(); }
  } catch (e) {
    console.error("[renvoyer-lien-famille]", e);   // la réponse reste neutre
  }
  return reponse;
});
