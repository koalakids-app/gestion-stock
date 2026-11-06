// Edge function "relancer-stagiaire"
// ============================================================================
// Relance par e-mail (SMTP Gmail) une stagiaire ou un alternant qui n'a pas
// encore déposé toutes ses pièces obligatoires. Bouton « Relancer » de la fiche.
// Appelée avec le JWT de l'utilisateur connecté (référent ou direction).
// Rien n'est pris du client sauf l'id de la fiche : les pièces manquantes sont
// recalculées ici (catalogue actif du profil, pièces refusées = manquantes) et
// le lien est reconstruit à partir du jeton en base.
// Refus si : pas d'e-mail, lien absent / expiré, lien encore à l'étape
// « entretien » (la personne ne pourrait rien déposer), fiche close, ou plus
// aucune pièce manquante. Pose stagiaires.relance_le (sql/stagiaires_relance.sql,
// facultatif : l'envoi ne dépend pas de la colonne).
// DÉPLOIEMENT : supabase functions deploy relancer-stagiaire (JWT activé).
// Secrets : GMAIL_USER, GMAIL_APP_PASSWORD.
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

  let body: { stagiaire_id?: string; expediteur?: string };
  try { body = await req.json(); } catch { return json({ error: "corps_invalide" }, 400); }
  if (!body.stagiaire_id) return json({ error: "stagiaire_id_manquant" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(jwt);
    if (!u?.user) return json({ error: "non_autorise" }, 401);
    const { data: ref } = await sb.from("referents").select("id").eq("user_id", u.user.id).maybeSingle();
    if (!ref) return json({ error: "non_autorise" }, 403);

    const { data: stag } = await sb.from("stagiaires")
      .select("id, prenom, email, token, token_expire_le, lien_etape, creche_id, statut, type_contrat, date_debut")
      .eq("id", body.stagiaire_id).maybeSingle();
    if (!stag) return json({ error: "stagiaire_introuvable" }, 404);
    if (!stag.email) return json({ error: "aucun_email" }, 400);
    if (["annule", "refuse", "termine", "demande"].includes(stag.statut || "")) return json({ error: "fiche_close" }, 400);
    if (!stag.token || !stag.token_expire_le || new Date(stag.token_expire_le).getTime() < Date.now()) {
      return json({ error: "lien_expire" }, 400);
    }
    if (stag.lien_etape === "entretien") return json({ error: "documents_non_ouverts" }, 400);

    // Pièces obligatoires du profil, sans celles déjà reçues (refusée = manquante).
    const profil = stag.type_contrat === "alternant" ? "alternant" : "stagiaire";
    let types: { id: string; libelle: string }[] = [];
    const q = await sb.from("stagiaires_docs_types").select("id, libelle, ordre")
      .eq("actif", true).eq("obligatoire", true).in("pour_type", ["tous", profil]).order("ordre");
    if (!q.error) types = q.data || [];
    else {
      const b = await sb.from("stagiaires_docs_types").select("id, libelle, ordre")
        .eq("actif", true).eq("obligatoire", true).order("ordre");
      types = b.data || [];
    }
    const { data: docs } = await sb.from("stagiaires_documents")
      .select("type_id, statut").eq("stagiaire_id", stag.id);
    const couverts = new Set((docs || []).filter((d) => d.statut !== "refuse").map((d) => String(d.type_id)));
    const manquantes = types.filter((t) => !couverts.has(String(t.id))).map((t) => t.libelle);
    if (!manquantes.length) return json({ error: "rien_a_relancer" }, 400);

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
    const expire = new Date(stag.token_expire_le).toLocaleDateString("fr-FR");
    const liste = manquantes.map((l) => `<li style="margin:0 0 4px">${esc(l)}</li>`).join("");

    const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F6FC;padding:24px 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2740;line-height:1.6">
    <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E3E1EF">
      <div style="padding:20px 24px;text-align:center"><img src="${esc(logoUrl)}" alt="${esc(orgNom)}" width="220" style="display:inline-block;height:auto"></div>
      <div style="background:#3D3580;color:#fff;padding:18px 24px">
        <div style="font-size:20px;font-weight:700">Il manque quelques documents</div>
        <div style="font-size:14px;opacity:.85;margin-top:3px">${esc(orgNom)}${crecheNom ? " · " + esc(crecheNom) : ""}</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 14px;font-size:15px">Bonjour ${esc(stag.prenom)}, pour finaliser votre dossier, il nous manque encore :</p>
        <div style="background:#F1EFF7;border-radius:16px;padding:16px 20px 12px;margin:0 0 18px">
          <ul style="margin:0;padding-left:18px;font-size:14px;font-weight:700;color:#4A3F9F">${liste}</ul>
        </div>
        <p style="margin:0 0 22px;text-align:center"><a href="${esc(lien)}" style="display:inline-block;background:#F47920;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 30px;border-radius:11px">Déposer mes documents</a></p>
        <p style="margin:0 0 10px;font-size:13px">Merci de les déposer directement sur ce lien (depuis votre téléphone, sans compte) et <strong>de ne pas les envoyer en réponse à cet e-mail</strong>. Le lien est valable jusqu'au ${esc(expire)}.</p>
        <p style="margin:0;font-size:12px;color:#8E8AA8">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><a href="${esc(lien)}" style="color:#8E8AA8">${esc(lien)}</a></p>
      </div>
    </div></body></html>`;

    const user = Deno.env.get("GMAIL_USER"), pass = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!user || !pass) throw new Error("Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).");
    const client = new SMTPClient({ connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: user, password: pass } } });
    try {
      await client.send({
        from: `${exp} de ${orgNom} <${user}>`,
        replyTo: "a.janin@koalakids.fr",
        to: [stag.email],
        subject: sujet(`Vos documents de dossier - ${orgNom}`),
        content: "Ce message nécessite un client de messagerie compatible HTML.",
        html,
      });
    } finally { await client.close(); }

    const quand = new Date().toISOString();
    const maj = await sb.from("stagiaires").update({ relance_le: quand }).eq("id", stag.id);
    if (maj.error) console.warn("[relancer-stagiaire] relance_le non enregistrée", maj.error.message);
    return json({ ok: true, manquantes: manquantes.length, relance_le: quand });
  } catch (e) {
    console.error("[relancer-stagiaire]", e);
    return json({ error: (e as Error).message || "erreur_inconnue" }, 500);
  }
});
