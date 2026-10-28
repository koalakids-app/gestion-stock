// Edge function "envoyer-envoi-stagiaire"
// ============================================================================
// Prévient par e-mail (SMTP Gmail) une stagiaire ou un alternant qu'un document
// vient d'être ajouté à son lien (table stagiaires_envois, fiche stagiaire).
// Appelée par la fiche juste après l'ajout, avec le JWT de l'utilisateur
// connecté. Le contenu n'est jamais pris du client : on relit l'envoi et la
// fiche par leur id, et le lien est reconstruit à partir du jeton en base.
// Le message ne cite que le titre du document et le lien : le fichier reste
// derrière le lien (URL signée de 5 minutes).
// Secrets : GMAIL_USER, GMAIL_APP_PASSWORD (comme envoyer-formation).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Sujet en ASCII pur : voir envoyer-formation (denomailer coupe les sujets accentués).
const sujet = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[—–]/g, "-")
    .replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim() || "Notification";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { envoi_id?: string; expediteur?: string };
  try { body = await req.json(); } catch { return json({ error: "corps_invalide" }, 400); }
  if (!body.envoi_id) return json({ error: "envoi_id_manquant" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // L'appelant doit être un compte de l'appli (référent ou direction).
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(jwt);
    if (!u?.user) return json({ error: "non_autorise" }, 401);
    const { data: ref } = await sb.from("referents").select("id").eq("user_id", u.user.id).maybeSingle();
    if (!ref) return json({ error: "non_autorise" }, 403);

    const { data: envoi } = await sb.from("stagiaires_envois")
      .select("id, stagiaire_id, libelle, message").eq("id", body.envoi_id).maybeSingle();
    if (!envoi) return json({ error: "envoi_introuvable" }, 404);

    const { data: stag } = await sb.from("stagiaires")
      .select("prenom, email, token, token_expire_le, creche_id, statut").eq("id", envoi.stagiaire_id).maybeSingle();
    if (!stag) return json({ error: "stagiaire_introuvable" }, 404);
    if (!stag.email) return json({ error: "aucun_email" }, 400);
    if (!stag.token || !stag.token_expire_le || new Date(stag.token_expire_le).getTime() < Date.now()
        || stag.statut === "annule" || stag.statut === "refuse") {
      return json({ error: "lien_expire" }, 400);
    }

    let orgNom = "Koalakids", logoUrl = "https://koalakids-app.github.io/gestion-stock/logo-koalakids.png", crecheNom = "";
    if (stag.creche_id) {
      const { data: c } = await sb.from("creches").select("name, org_id").eq("id", stag.creche_id).maybeSingle();
      crecheNom = c?.name || "";
      if (c?.org_id) {
        const { data: o } = await sb.from("organisations").select("nom, logo_url").eq("id", c.org_id).maybeSingle();
        if (o?.nom) orgNom = o.nom;
        if (o?.logo_url) logoUrl = o.logo_url;
      }
    }

    const appUrl = (Deno.env.get("APP_URL_APPLI") ?? "https://koalakids-app.github.io/gestion-stock").replace(/\/+$/, "");
    const lien = `${appUrl}/stagiaire.html?t=${encodeURIComponent(stag.token)}`;
    const exp = String(body.expediteur || "").replace(/[\r\n<>]/g, "").trim().split(/\s+/)[0].slice(0, 60) || "Koala Kids";

    const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F6FC;padding:24px 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2740;line-height:1.6">
    <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E3E1EF">
      <div style="padding:20px 24px;text-align:center"><img src="${esc(logoUrl)}" alt="${esc(orgNom)}" width="220" style="display:inline-block;height:auto"></div>
      <div style="background:#3D3580;color:#fff;padding:18px 24px">
        <div style="font-size:20px;font-weight:700">Nouveau document</div>
        <div style="font-size:14px;opacity:.85;margin-top:3px">${esc(orgNom)}${crecheNom ? " · " + esc(crecheNom) : ""}</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 18px;font-size:15px">Bonjour ${esc(stag.prenom)}, la crèche a ajouté un document à votre dossier :</p>
        <div style="background:#F1EFF7;border-radius:16px;padding:18px 20px;margin:0 0 ${envoi.message ? 12 : 22}px">
          <div style="font-size:15px;font-weight:800;color:#4A3F9F">${esc(envoi.libelle)}</div>
        </div>
        ${envoi.message ? `<p style="margin:0 0 22px;font-size:14px">${esc(envoi.message)}</p>` : ""}
        <p style="margin:0 0 22px;text-align:center"><a href="${esc(lien)}" style="display:inline-block;background:#F47920;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 30px;border-radius:11px">Ouvrir mon dossier</a></p>
        <p style="margin:0;font-size:12px;color:#8E8AA8">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><a href="${esc(lien)}" style="color:#8E8AA8">${esc(lien)}</a></p>
      </div>
    </div></body></html>`;

    const user = Deno.env.get("GMAIL_USER"), pass = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!user || !pass) throw new Error("Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).");
    const client = new SMTPClient({ connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: user, password: pass } } });
    try {
      await client.send({
        from: `${exp} de ${orgNom} <${user}>`,
        to: [stag.email],
        subject: sujet(`Un document vous attend - ${orgNom}`),
        content: "Ce message nécessite un client de messagerie compatible HTML.",
        html,
      });
    } finally { await client.close(); }

    await sb.from("stagiaires_envois").update({ prevenu_le: new Date().toISOString() }).eq("id", envoi.id);
    return json({ ok: true });
  } catch (e) {
    console.error("[envoyer-envoi-stagiaire]", e);
    return json({ error: (e as Error).message || "erreur_inconnue" }, 500);
  }
});
