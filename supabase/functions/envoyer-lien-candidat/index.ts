// Edge function "envoyer-lien-candidat"
// ============================================================================
// Envoie par e-mail (SMTP Gmail) à un·e candidat·e le lien de son dossier de
// recrutement (candidat.html) : projet pédagogique, pièces jointes (fiche de
// poste…) et questionnaire. Appelée par la fiche (Demandes › Recrutement) avec
// le JWT de la personne connectée. Rien n'est pris du client : la fiche, les
// pièces et le jeton sont relus en base. Aucun fichier n'est joint à l'e-mail :
// tout reste derrière le lien (URL signées de 5 minutes).
// Secrets : GMAIL_USER, GMAIL_APP_PASSWORD (comme envoyer-formation).
// Déploiement : vérification JWT activée (deploy-functions.yml, cas général).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crecheParId, estGestionnaire, identifierAppelant, peutGererCreche } from "../_shared/appelant.ts";
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

const dfr = (d: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR") : "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { candidat_id?: string; expediteur?: string };
  try { body = await req.json(); } catch { return json({ error: "corps_invalide" }, 400); }
  if (!body.candidat_id) return json({ error: "candidat_id_manquant" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const appelant = await identifierAppelant(sb, req);
    if (!appelant) return json({ error: "non_autorise" }, 401);
    if (!estGestionnaire(appelant)) return json({ error: "non_autorise" }, 403);

    const { data: cand } = await sb.from("recrutement_candidats")
      .select("id, prenom, email, poste, token, token_expire_le, creche_id, statut, avec_projet, avec_questionnaire, entretien_date, entretien_heure")
      .eq("id", body.candidat_id).maybeSingle();
    if (!cand) return json({ error: "candidat_introuvable" }, 404);
    const cr = await crecheParId(sb, cand.creche_id);
    if (!cr || !peutGererCreche(appelant, cr)) return json({ error: "creche_non_autorisee" }, 403);
    if (!cand.email) return json({ error: "aucun_email" }, 400);
    if (!cand.token || !cand.token_expire_le || new Date(cand.token_expire_le).getTime() < Date.now()
        || cand.statut === "refuse" || cand.statut === "desiste") {
      return json({ error: "lien_expire" }, 400);
    }

    let orgNom = "Koalakids", logoUrl = "https://koalakids-app.github.io/gestion-stock/logo-koalakids.png", crecheNom = "";
    {
      const { data: c } = await sb.from("creches").select("name, org_id").eq("id", cand.creche_id).maybeSingle();
      crecheNom = c?.name || "";
      if (c?.org_id) {
        const { data: o } = await sb.from("organisations").select("nom, logo_url").eq("id", c.org_id).maybeSingle();
        if (o?.nom) orgNom = o.nom;
        if (o?.logo_url) logoUrl = o.logo_url;
      }
    }

    const { data: envois } = await sb.from("recrutement_envois").select("libelle").eq("candidat_id", cand.id).order("created_at");
    const contenu: string[] = [];
    if (cand.avec_projet) contenu.push("Notre projet pédagogique, à lire");
    (envois || []).forEach((e: { libelle: string }) => contenu.push(e.libelle));
    if (cand.avec_questionnaire) contenu.push("Un court questionnaire sur le projet, à remplir en ligne");

    const appUrl = (Deno.env.get("APP_URL_APPLI") ?? "https://koalakids-app.github.io/gestion-stock").replace(/\/+$/, "");
    const lien = `${appUrl}/candidat.html?t=${encodeURIComponent(cand.token)}`;
    const exp = String(body.expediteur || "").replace(/[\r\n<>]/g, "").trim().split(/\s+/)[0].slice(0, 60) || "Koala Kids";
    const rdv = cand.entretien_date
      ? `<p style="margin:0 0 18px;font-size:15px">Notre entretien est prévu le <b>${esc(dfr(cand.entretien_date))}</b>${cand.entretien_heure ? " à <b>" + esc(cand.entretien_heure) + "</b>" : ""}.</p>`
      : "";

    const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F6FC;padding:24px 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2740;line-height:1.6">
    <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E3E1EF">
      <div style="padding:20px 24px;text-align:center"><img src="${esc(logoUrl)}" alt="${esc(orgNom)}" width="220" style="display:inline-block;height:auto"></div>
      <div style="background:#3D3580;color:#fff;padding:18px 24px">
        <div style="font-size:20px;font-weight:700">Votre candidature${cand.poste ? " — " + esc(cand.poste) : ""}</div>
        <div style="font-size:14px;opacity:.85;margin-top:3px">${esc(orgNom)}${crecheNom ? " · " + esc(crecheNom) : ""}</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 18px;font-size:15px">Bonjour ${esc(cand.prenom)}, merci pour votre candidature. Pour préparer notre échange, voici un lien personnel qui contient :</p>
        <div style="background:#F1EFF7;border-radius:16px;padding:14px 20px;margin:0 0 18px">
          <ul style="margin:0;padding-left:18px;font-size:14.5px">${contenu.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
        </div>
        ${rdv}
        <p style="margin:0 0 22px;text-align:center"><a href="${esc(lien)}" style="display:inline-block;background:#F47920;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 30px;border-radius:11px">Ouvrir mon dossier</a></p>
        <p style="margin:0 0 14px;font-size:13px;color:#5F5B78">Ce lien est personnel et valable jusqu'au ${esc(new Date(cand.token_expire_le).toLocaleDateString("fr-FR"))}. Merci de répondre au questionnaire directement sur le lien ; pour toute question, vous pouvez répondre à cet e-mail.</p>
        <p style="margin:0;font-size:12px;color:#8E8AA8">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><a href="${esc(lien)}" style="color:#8E8AA8">${esc(lien)}</a></p>
      </div>
    </div></body></html>`;

    const user = Deno.env.get("GMAIL_USER"), pass = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!user || !pass) throw new Error("Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).");
    const client = new SMTPClient({ connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: user, password: pass } } });
    try {
      await client.send({
        from: `${exp} de ${orgNom} <${user}>`,
        to: [cand.email],
        replyTo: "a.janin@koalakids.fr",
        subject: sujet(`Votre candidature - ${orgNom}`),
        content: "Ce message nécessite un client de messagerie compatible HTML.",
        html,
      });
    } finally { await client.close(); }

    const le = new Date().toISOString();
    await sb.from("recrutement_candidats").update({ lien_envoye_le: le }).eq("id", cand.id);
    return json({ ok: true, le });
  } catch (e) {
    console.error("[envoyer-lien-candidat]", e);
    return json({ error: (e as Error).message || "erreur_inconnue" }, 500);
  }
});
