// Edge function "envoyer-formation"
// ============================================================================
// Envoie par e-mail (SMTP Gmail) le lien d'un quiz ou d'une micro-formation
// (module Formation et quiz, koalakids-app/quiz-protocoles) à un(e)
// collaborateur/trice, au moment où la direction (ou une directrice
// technique) clique sur "Envoyer" depuis sa fiche (employes.html).
//
// Jusqu'ici, cet envoi se contentait de copier le lien dans le
// presse-papiers côté navigateur (navigator.clipboard.writeText) : silencieux
// en cas d'échec (permission refusée, contexte non sécurisé...), la personne
// se retrouvait à coller un e-mail vide sans le savoir. Envoyer un vrai
// e-mail depuis le serveur, comme envoyer-code-pointage, supprime cette
// dépendance au presse-papiers du navigateur.
//
// Le contenu de l'e-mail n'est jamais pris depuis le client : on relit la
// ligne `formations_envois` par son id (déjà enregistrée avant l'appel) et
// les coordonnées du/de la collaborateur/trice, pour ne jamais faire confiance
// à un titre ou un lien fourni tel quel par l'appelant.
//
// Secrets nécessaires (mêmes noms que les autres fonctions d'envoi d'e-mail
// de l'appli) :
//   GMAIL_USER           — adresse Gmail d'expédition (ex. koalakids.app@gmail.com)
//   GMAIL_APP_PASSWORD   — mot de passe d'application à 16 caractères
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sendEmail(to: string[], subject: string, html: string) {
  const user = Deno.env.get("GMAIL_USER");
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) {
    throw new Error("Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).");
  }
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: user, password: pass },
    },
  });
  try {
    await client.send({
      from: user,
      to,
      subject,
      content: "Ce message nécessite un client de messagerie compatible HTML.",
      html,
    });
  } finally {
    await client.close();
  }
}

function formationEmailHtml(opts: { prenom: string; kindLabel: string; titre: string; lien: string; creche: string }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F6FC;padding:24px 12px;
    font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2740;line-height:1.6">
    <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;
      border:1px solid #E3E1EF">
      <table role="presentation" width="100%" style="border-collapse:collapse">
        <tr>
          <td style="background:#fff;padding:20px 24px;text-align:center">
            <img src="https://koalakids-app.github.io/gestion-stock/logo-koalakids.png" alt="Koala Kids"
              width="220" style="display:inline-block;height:auto">
          </td>
        </tr>
        <tr>
          <td style="background:#3D3580;color:#fff;padding:18px 24px">
            <div style="font-size:20px;font-weight:700">Formation &amp; quiz</div>
            <div style="font-size:14px;opacity:.85;margin-top:3px">Koala Kids${opts.creche ? ' · ' + opts.creche : ''}</div>
          </td>
        </tr>
      </table>
      <div style="padding:24px">
        <p style="margin:0 0 18px;font-size:15px">
          Bonjour ${opts.prenom || ""}, la direction vous a transmis ${opts.kindLabel} à réaliser :
        </p>
        <div style="background:#F1EFF7;border-radius:16px;padding:18px 20px;margin:0 0 22px">
          <div style="font-size:15px;font-weight:800;color:#4A3F9F">${opts.titre}</div>
        </div>
        <p style="margin:0 0 22px;text-align:center">
          <a href="${opts.lien}" style="display:inline-block;background:#F47920;color:#fff;text-decoration:none;
            font-weight:700;font-size:16px;padding:14px 30px;border-radius:11px">Commencer</a>
        </p>
        <p style="margin:0;font-size:12px;color:#8E8AA8;line-height:1.6">
          Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
          <a href="${opts.lien}" style="color:#8E8AA8">${opts.lien}</a>
        </p>
      </div>
    </div>
  </body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { envoi_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps_invalide" }, 400);
  }
  const { envoi_id } = body;
  if (!envoi_id) return json({ error: "envoi_id_manquant" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: envoi, error: envErr } = await supabase
      .from("formations_envois")
      .select("id, employe_id, referent_id, kind, item_titre, lien")
      .eq("id", envoi_id)
      .maybeSingle();
    if (envErr) throw envErr;
    if (!envoi) return json({ error: "envoi_introuvable" }, 404);

    let prenom = "";
    let email: string | null = null;
    let creche_id: string | null = null;

    if (envoi.employe_id) {
      const { data: employe, error } = await supabase
        .from("employes").select("prenom, email, creche_id").eq("id", envoi.employe_id).maybeSingle();
      if (error) throw error;
      if (!employe) return json({ error: "collaborateur_introuvable" }, 404);
      prenom = employe.prenom || "";
      email = employe.email;
      creche_id = employe.creche_id;
    } else {
      const { data: referent, error } = await supabase
        .from("referents").select("name, email, creche_id").eq("id", envoi.referent_id).maybeSingle();
      if (error) throw error;
      if (!referent) return json({ error: "collaborateur_introuvable" }, 404);
      prenom = referent.name || "";
      email = referent.email;
      creche_id = referent.creche_id;
    }

    if (!email) return json({ error: "aucun_email" }, 400);

    const { data: creche } = creche_id
      ? await supabase.from("creches").select("name").eq("id", creche_id).maybeSingle()
      : { data: null };

    const kindLabel = envoi.kind === "quiz" ? "un quiz" : "une micro-formation";
    await sendEmail(
      [email],
      (envoi.kind === "quiz" ? "Un quiz vous a été envoyé" : "Une formation vous a été envoyée") + " — Koala Kids",
      formationEmailHtml({
        prenom,
        kindLabel,
        titre: envoi.item_titre,
        lien: envoi.lien,
        creche: creche?.name || "",
      }),
    );
    return json({ ok: true, sent_to: 1 });
  } catch (err) {
    console.error("[envoyer-formation]", err);
    return json({ error: (err as Error).message || "erreur_inconnue" }, 500);
  }
});
