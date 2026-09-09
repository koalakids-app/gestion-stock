// Edge function "envoyer-code-pointage"
// ============================================================================
// Envoie par e-mail (Resend) le code de pointage à 4 chiffres d'un enfant
// (aux parents marqués "destinataire", ou à défaut tous les parents ayant un
// e-mail) ou d'un salarié (à sa propre adresse).
//
// Appelée depuis demandes.html (fonctions kkSendCode → callFn) avec l'anon key,
// comme les autres fonctions du module Référents (send-referent-link,
// create-referent...). Le filtrage par droits est déjà fait côté client : ce
// module n'est visible qu'aux comptes direction/référente, et RLS limite déjà
// ce que le client a pu charger dans cacheEnfants/cacheReferents. Cette
// fonction utilise le service role uniquement pour lire code_pointage et les
// coordonnées — elle n'expose rien de plus que ce que l'appelant demande.
//
// Déploiement :
//   supabase functions deploy envoyer-code-pointage
// Secrets nécessaires (déjà posés — voir `supabase secrets list`) :
//   RESEND_API_KEY   — clé API Resend
//   FROM_EMAIL       — adresse d'expédition vérifiée, ex. "Koala Kids <no-reply@koalakids.fr>"
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement par
// la plateforme Supabase Edge Functions, pas besoin de les poser à la main.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

async function sendResendEmail(to: string[], subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("FROM_EMAIL");
  if (!apiKey || !from) {
    throw new Error("Configuration Resend manquante (RESEND_API_KEY / FROM_EMAIL).");
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Resend a refusé l'envoi (HTTP ${r.status}) : ${txt.slice(0, 300)}`);
  }
}

function codeEmailHtml(opts: { titre: string; sousTitre: string; code: string; creche: string }) {
  return `
    <div style="font-family:'Nunito',Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#4A3F9F;margin:0 0 4px">${opts.titre}</h2>
      <p style="color:#8E8AA8;margin:0 0 20px">${opts.sousTitre} — ${opts.creche}</p>
      <div style="background:#F1EFF7;border-radius:16px;padding:20px;text-align:center;margin-bottom:18px">
        <div style="font-size:13px;color:#8E8AA8;margin-bottom:6px">Code de pointage</div>
        <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#4A3F9F">${opts.code}</div>
      </div>
      <p style="color:#2B2740;font-size:14px;line-height:1.6">
        Ce code personnel permet de pointer l'arrivée et le départ directement sur la tablette
        dédiée de la crèche. Il est propre à cette personne : merci de ne pas le communiquer
        à d'autres familles ou salarié(e)s.
      </p>
    </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { type?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps_invalide" }, 400);
  }
  const { type, id } = body;
  if (type !== "enfant" && type !== "salarie" && type !== "employe") return json({ error: "type_invalide" }, 400);
  if (!id) return json({ error: "id_manquant" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (type === "enfant") {
      const { data: enfant, error: eErr } = await supabase
        .from("enfants")
        .select("id, prenom, nom, code_pointage, creche_id")
        .eq("id", id)
        .maybeSingle();
      if (eErr) throw eErr;
      if (!enfant) return json({ error: "enfant_introuvable" }, 404);
      if (!enfant.code_pointage) return json({ error: "code_absent" }, 400);

      const { data: creche } = await supabase
        .from("creches").select("name").eq("id", enfant.creche_id).maybeSingle();

      const { data: parents, error: pErr } = await supabase
        .from("enfants_parents")
        .select("email, destinataire")
        .eq("enfant_id", id);
      if (pErr) throw pErr;
      const tous = (parents || []).filter((p) => p.email);
      const cibles = tous.filter((p) => p.destinataire);
      const emails = [...new Set((cibles.length ? cibles : tous).map((p) => p.email as string))];
      if (!emails.length) return json({ error: "aucun_email_parent" }, 400);

      await sendResendEmail(
        emails,
        `Code de pointage — ${enfant.prenom || "votre enfant"}`,
        codeEmailHtml({
          titre: `Code de pointage de ${enfant.prenom || ""} ${enfant.nom || ""}`.trim(),
          sousTitre: "À taper sur la tablette de pointage",
          code: enfant.code_pointage,
          creche: creche?.name || "",
        }),
      );
      return json({ ok: true, sent_to: emails.length });
    }

    if (type === "salarie") {
      const { data: referent, error: rErr } = await supabase
        .from("referents")
        .select("id, name, email, code_pointage, creche_id")
        .eq("id", id)
        .maybeSingle();
      if (rErr) throw rErr;
      if (!referent) return json({ error: "referent_introuvable" }, 404);
      if (!referent.code_pointage) return json({ error: "code_absent" }, 400);
      if (!referent.email) return json({ error: "aucun_email" }, 400);

      const { data: creche } = await supabase
        .from("creches").select("name").eq("id", referent.creche_id).maybeSingle();

      await sendResendEmail(
        [referent.email],
        "Votre code de pointage",
        codeEmailHtml({
          titre: `Code de pointage de ${referent.name || ""}`,
          sousTitre: "À taper sur la tablette de pointage",
          code: referent.code_pointage,
          creche: creche?.name || "",
        }),
      );
      return json({ ok: true, sent_to: 1 });
    }

    // type === "employe" (table `employes`, personnel sans compte de connexion)
    const { data: employe, error: emErr } = await supabase
      .from("employes")
      .select("id, prenom, nom, email, code_pointage, creche_id")
      .eq("id", id)
      .maybeSingle();
    if (emErr) throw emErr;
    if (!employe) return json({ error: "employe_introuvable" }, 404);
    if (!employe.code_pointage) return json({ error: "code_absent" }, 400);
    if (!employe.email) return json({ error: "aucun_email" }, 400);

    const { data: creche } = await supabase
      .from("creches").select("name").eq("id", employe.creche_id).maybeSingle();

    await sendResendEmail(
      [employe.email],
      "Votre code de pointage",
      codeEmailHtml({
        titre: `Code de pointage de ${employe.prenom || ""} ${employe.nom || ""}`.trim(),
        sousTitre: "À taper sur la tablette de pointage",
        code: employe.code_pointage,
        creche: creche?.name || "",
      }),
    );
    return json({ ok: true, sent_to: 1 });
  } catch (err) {
    console.error("[envoyer-code-pointage]", err);
    return json({ error: (err as Error).message || "erreur_inconnue" }, 500);
  }
});
