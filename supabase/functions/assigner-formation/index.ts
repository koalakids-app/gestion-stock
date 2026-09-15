// Edge function "assigner-formation"
// ============================================================================
// Depuis l'espace "Quiz & Formations" (koalakids-app/quiz-protocoles,
// admin.html — projet Supabase distinct), la direction choisit un ou
// plusieurs collaborateurs/trices et leur assigne un quiz ou une
// micro-formation : cette fonction enregistre l'assignation (table
// `formations_envois`, pour qu'elle apparaisse dans "Mon espace" côté
// collaborateur/trice) et envoie une notification par e-mail.
//
// admin.html n'a pas de session valable sur CE projet Supabase (son compte
// direction est authentifié sur le projet quiz-protocoles) : impossible donc
// de passer par les policies RLS habituelles de `formations_envois`, qui
// exigent un `auth.uid()` référencé dans `referents`. Protégé par une clé
// partagée (`x-formations-key`, secret FORMATIONS_SHARED_KEY, même valeur que
// lister-collaborateurs) plutôt que par une session.
//
// Le lien transmis à chaque collaborateur/trice est construit ici, jamais
// pris tel quel depuis le client : seuls kind/item_id/item_titre et
// l'identité de chaque cible (relue en base) y entrent.
//
// Secrets nécessaires : FORMATIONS_SHARED_KEY, GMAIL_USER, GMAIL_APP_PASSWORD
// (les deux derniers déjà utilisés par les autres fonctions d'envoi).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-formations-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const QUIZ_APP_URL = "https://koalakids-app.github.io/quiz-protocoles/index.html";
const FORMATIONS_APP_URL = "https://koalakids-app.github.io/quiz-protocoles/formations.html";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sendEmail(to: string[], subject: string, html: string) {
  const user = Deno.env.get("GMAIL_USER");
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) throw new Error("Configuration Gmail manquante.");
  const client = new SMTPClient({
    connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: user, password: pass } },
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

function notifHtml(opts: { prenom: string; kindLabel: string; titre: string; lien: string; creche: string }) {
  return `
    <div style="font-family:'Nunito',Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#4A3F9F;margin:0 0 4px">Bonjour ${opts.prenom || ""}</h2>
      <p style="color:#2B2740;font-size:14px;line-height:1.6;margin:14px 0">
        La direction vous a assigné ${opts.kindLabel}${opts.creche ? " — " + opts.creche : ""} :
      </p>
      <div style="background:#F1EFF7;border-radius:16px;padding:18px 20px;margin:0 0 18px">
        <div style="font-size:15px;font-weight:800;color:#4A3F9F">${opts.titre}</div>
      </div>
      <div style="text-align:center;margin-bottom:10px">
        <a href="${opts.lien}" style="display:inline-block;background:#F47920;color:#fff;font-weight:700;
          font-size:14px;text-decoration:none;padding:12px 24px;border-radius:12px">Commencer maintenant</a>
      </div>
      <p style="color:#8E8AA8;font-size:12px;line-height:1.6;text-align:center">
        Vous le retrouverez aussi dans votre espace, section « Mon parcours de formation ».
      </p>
    </div>`;
}

type Cible = { id: string; type: "employe" | "referent" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const sharedKey = Deno.env.get("FORMATIONS_SHARED_KEY");
  if (!sharedKey || req.headers.get("x-formations-key") !== sharedKey) {
    return json({ error: "non_autorise" }, 401);
  }

  let body: { kind?: string; item_id?: string; item_titre?: string; cibles?: Cible[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps_invalide" }, 400);
  }
  const { kind, item_id, item_titre, cibles } = body;
  if (kind !== "quiz" && kind !== "module") return json({ error: "kind_invalide" }, 400);
  if (!item_id || !item_titre) return json({ error: "item_manquant" }, 400);
  if (!Array.isArray(cibles) || !cibles.length) return json({ error: "cibles_manquantes" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const kindLabel = kind === "quiz" ? "un quiz" : "une micro-formation";
  const base = kind === "quiz" ? QUIZ_APP_URL : FORMATIONS_APP_URL;

  const resultats: { id: string; nom: string; email_envoye: boolean; erreur?: string }[] = [];

  for (const cible of cibles) {
    try {
      let prenom = "", nom = "", email: string | null = null, creche_id: string | null = null;

      if (cible.type === "employe") {
        const { data, error } = await supabase
          .from("employes").select("prenom, nom, email, creche_id").eq("id", cible.id).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("introuvable");
        prenom = data.prenom || ""; nom = data.nom || ""; email = data.email; creche_id = data.creche_id;
      } else {
        const { data, error } = await supabase
          .from("referents").select("name, email, creche_id").eq("id", cible.id).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("introuvable");
        const parts = (data.name || "").trim().split(/\s+/);
        prenom = parts[0] || ""; nom = parts.slice(1).join(" "); email = data.email; creche_id = data.creche_id;
      }

      const { data: creche } = creche_id
        ? await supabase.from("creches").select("name").eq("id", creche_id).maybeSingle()
        : { data: null };
      const crecheNom = creche?.name || "";

      const params = new URLSearchParams({
        ref: cible.id, prenom, nom, statut: "Salarié(e) en poste",
      });
      if (crecheNom) params.set("creche", crecheNom);
      params.set(kind === "quiz" ? "quiz" : "module", item_id);
      const lien = base + "?" + params.toString();

      const insert: Record<string, unknown> = {
        kind, item_id, item_titre, lien,
        [cible.type === "employe" ? "employe_id" : "referent_id"]: cible.id,
      };
      const { error: insErr } = await supabase.from("formations_envois").insert(insert);
      if (insErr) throw insErr;

      let emailEnvoye = false;
      if (email) {
        await sendEmail(
          [email],
          (kind === "quiz" ? "Un quiz vous a été assigné" : "Une formation vous a été assignée") + " — Koala Kids",
          notifHtml({ prenom, kindLabel, titre: item_titre, lien, creche: crecheNom }),
        );
        emailEnvoye = true;
      }
      resultats.push({ id: cible.id, nom: `${prenom} ${nom}`.trim(), email_envoye: emailEnvoye });
    } catch (err) {
      resultats.push({
        id: cible.id, nom: "", email_envoye: false,
        erreur: (err as Error).message || "erreur_inconnue",
      });
    }
  }

  return json({ ok: true, resultats }, 200);
});
