// Edge function "envoyer-lien-candidat"
// ============================================================================
// Envoie par e-mail (SMTP Gmail) à un·e candidat·e le lien de son dossier de
// recrutement (candidat.html) : projet pédagogique, pièces jointes (fiche de
// poste…) et questionnaire. Appelée par la fiche (Demandes › Recrutement) avec
// le JWT de la personne connectée. Rien n'est pris du client : la fiche, les
// pièces et le jeton sont relus en base. Aucun fichier n'est joint à l'e-mail :
// tout reste derrière le lien (URL signées de 5 minutes).
// Le texte est le message habituel de la direction (civilité + nom, type de
// candidature, crèche, rendez-vous et adresse, contenu du lien, confirmation
// par retour de mail). `apercu: true` renvoie ce texte sans rien envoyer : la
// fiche l'affiche avant l'envoi. Les réponses arrivent à la personne qui envoie
// (referents.email), à défaut a.janin@koalakids.fr.
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

const dateLongue = (d: string | null) =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";

/** « Koalakids Ollioules » → « d'Ollioules », « Koalakids Cuers » → « de Cuers ». */
function lieuCreche(nom: string): string {
  const lieu = nom.replace(/^koala\s*kids\s*/i, "").trim();
  if (!lieu) return nom ? " " + nom : "";
  return (/^[aeiouyhàâéèêëîïôöûü]/i.test(lieu) ? " d'" : " de ") + lieu;
}

const liste = (t: string[]) => t.length <= 1 ? t.join("") : t.slice(0, -1).join(", ") + " et " + t[t.length - 1];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { candidat_id?: string; apercu?: boolean };
  try { body = await req.json(); } catch { return json({ error: "corps_invalide" }, 400); }
  if (!body.candidat_id) return json({ error: "candidat_id_manquant" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const appelant = await identifierAppelant(sb, req);
    if (!appelant) return json({ error: "non_autorise" }, 401);
    if (!estGestionnaire(appelant)) return json({ error: "non_autorise" }, 403);

    // select('*') : civilite / type_candidature (sql/recrutement_email.sql) peuvent manquer.
    const { data: cand } = await sb.from("recrutement_candidats").select("*").eq("id", body.candidat_id).maybeSingle();
    if (!cand) return json({ error: "candidat_introuvable" }, 404);
    const cr = await crecheParId(sb, cand.creche_id);
    if (!cr || !peutGererCreche(appelant, cr)) return json({ error: "creche_non_autorisee" }, 403);
    if (!cand.email) return json({ error: "aucun_email" }, 400);
    if (!cand.token || !cand.token_expire_le || new Date(cand.token_expire_le).getTime() < Date.now()
        || cand.statut === "refuse" || cand.statut === "desiste") {
      return json({ error: "lien_expire" }, 400);
    }

    let orgNom = "Koalakids", logoUrl = "https://koalakids-app.github.io/gestion-stock/logo-koalakids.png", crecheNom = "", crecheAdr = "";
    {
      const { data: c } = await sb.from("creches").select("name, addr, org_id").eq("id", cand.creche_id).maybeSingle();
      crecheNom = c?.name || "";
      crecheAdr = String(c?.addr || "").trim();
      if (c?.org_id) {
        const { data: o } = await sb.from("organisations").select("nom, logo_url").eq("id", c.org_id).maybeSingle();
        if (o?.nom) orgNom = o.nom;
        if (o?.logo_url) logoUrl = o.logo_url;
      }
    }

    // La personne qui envoie : elle signe le message et reçoit la confirmation.
    const { data: moi } = await sb.from("referents").select("name, poste, email").eq("user_id", appelant.userId).maybeSingle();
    const signNom = String(moi?.name || "").replace(/[\r\n<>]/g, "").trim().slice(0, 80);
    const signPoste = String(moi?.poste || "").replace(/[\r\n<>]/g, "").trim().slice(0, 80);
    const repondreA = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(moi?.email || "")) ? String(moi!.email) : "a.janin@koalakids.fr";

    // Ce que le lien contient, dans les mots du message habituel.
    const { data: envois } = await sb.from("recrutement_envois").select("libelle").eq("candidat_id", cand.id).order("created_at");
    const contenu: string[] = [];
    if (cand.avec_projet) contenu.push("notre projet pédagogique");
    (envois || []).forEach((e: { libelle: string }) => {
      const t = /fiche de poste/i.test(e.libelle) ? "la fiche de poste" : `« ${String(e.libelle).trim()} »`;
      if (!contenu.includes(t)) contenu.push(t);
    });
    if (cand.avec_questionnaire) contenu.push("un questionnaire sur le projet pédagogique");

    const appUrl = (Deno.env.get("APP_URL_APPLI") ?? "https://koalakids-app.github.io/gestion-stock").replace(/\/+$/, "");
    const lien = `${appUrl}/candidat.html?t=${encodeURIComponent(cand.token)}`;

    const civ = cand.civilite === undefined ? "Mme" : String(cand.civilite || "");
    const nom = String(cand.nom || "").trim();
    const salut = nom ? `Bonjour ${civ ? civ + " " : (cand.prenom + " ")}${nom},` : `Bonjour ${cand.prenom},`;
    const type = String(cand.type_candidature || "").trim() || "candidature";
    const heure = String(cand.entretien_heure || "").replace(":", "h");
    const rdv = cand.entretien_date
      ? `Si cela vous intéresse, je vous propose de nous rencontrer le ${dateLongue(cand.entretien_date)}${heure ? " à " + heure : ""}${crecheAdr ? ", à la micro-crèche : " + crecheAdr : ""}.`
      : `Si cela vous intéresse, je vous propose de convenir ensemble d'un rendez-vous${crecheAdr ? " à la micro-crèche : " + crecheAdr : ""}.`;

    // Avant le lien, puis après : la page et le texte brut suivent le même ordre.
    const avant = [
      salut,
      `Je fais suite à votre ${type} au sein de nos micro-crèches ${orgNom}. Je vous remercie pour l'intérêt que vous nous portez.`,
      `Je suis à la recherche d'une personne pour un remplacement sur notre micro-crèche${lieuCreche(crecheNom)}.`,
      rdv,
      contenu.length
        ? `Afin de préparer cet entretien, vous trouverez ci-dessous un lien regroupant ${liste(contenu)}. Merci de bien vouloir en prendre connaissance${cand.avec_questionnaire ? " et de répondre au questionnaire, qui servira de support pour notre entretien" : ""}.`
        : "Afin de préparer cet entretien, vous trouverez ci-dessous un lien personnel.",
    ];
    const apres = ["Veuillez me confirmer par retour de mail.", "Cordialement,"];
    const signature = [signNom, signPoste, orgNom].filter(Boolean);
    const valable = `Ce lien est personnel et valable jusqu'au ${new Date(cand.token_expire_le).toLocaleDateString("fr-FR")}.`;
    const objet = `Votre candidature - ${orgNom}`;

    if (body.apercu === true) {
      return json({
        ok: true, apercu: true, objet, destinataire: cand.email, repondre_a: repondreA,
        avant, apres, signature, valable,
      });
    }

    const para = (t: string) => `<p style="margin:0 0 14px;font-size:15px">${esc(t)}</p>`;
    const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F6FC;padding:24px 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2740;line-height:1.6">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E3E1EF">
      <div style="padding:20px 24px 6px;text-align:center"><img src="${esc(logoUrl)}" alt="${esc(orgNom)}" width="200" style="display:inline-block;height:auto"></div>
      <div style="padding:18px 26px 24px">
        ${avant.map(para).join("")}
        <p style="margin:20px 0 8px;text-align:center"><a href="${esc(lien)}" style="display:inline-block;background:#F47920;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 30px;border-radius:11px">Ouvrir le lien</a></p>
        <p style="margin:0 0 20px;font-size:12px;color:#8E8AA8;text-align:center">${esc(valable)}</p>
        ${apres.map(para).join("")}
        <p style="margin:0 0 18px;font-size:15px">${signature.map(esc).join("<br>")}</p>
        <p style="margin:0;font-size:12px;color:#8E8AA8">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><a href="${esc(lien)}" style="color:#8E8AA8">${esc(lien)}</a></p>
      </div>
    </div></body></html>`;
    const texte = [...avant, lien, valable, ...apres, signature.join("\n")].join("\n\n");

    const user = Deno.env.get("GMAIL_USER"), pass = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!user || !pass) throw new Error("Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).");
    const exp = signNom.split(/\s+/)[0] || "Koala Kids";
    const client = new SMTPClient({ connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: user, password: pass } } });
    try {
      await client.send({
        from: `${exp} de ${orgNom} <${user}>`,
        to: [cand.email],
        replyTo: repondreA,
        subject: sujet(objet),
        content: texte,
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
