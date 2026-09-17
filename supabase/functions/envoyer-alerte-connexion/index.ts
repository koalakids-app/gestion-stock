// Edge function "envoyer-alerte-connexion"
// ============================================================================
// Alerte de sécurité envoyée quand un compte se connecte depuis un appareil
// jamais vu (cf. sql/login_alertes.sql + js/login-alert.js). Le client
// n'appelle cette fonction QUE lorsque kk_enregistrer_connexion a répondu
// "nouvel appareil" : pas de vérification supplémentaire à faire ici sur la
// nouveauté, seulement identifier qui alerter et par quel(s) canal(aux).
//
// Deux canaux, en parallèle :
//   - push web (si la personne est abonnée via push_subscriptions, cf.
//     toggleNotificationsPush dans demandes.html) ;
//   - email, toujours, en secours (fonctionne même sans abonnement push /
//     sur un appareil qui n'a jamais activé les notifications).
//
// Déploiement :
//   supabase functions deploy envoyer-alerte-connexion
// Secrets nécessaires (en plus de GMAIL_USER / GMAIL_APP_PASSWORD déjà
// utilisés par les autres fonctions d'envoi de l'appli) :
//   VAPID_PRIVATE_KEY   — clé privée VAPID correspondant à la clé publique
//                          codée en dur dans demandes.html (toggleNotificationsPush).
// SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY sont injectées
// automatiquement par la plateforme.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
// L'import de web-push est fait à la demande (voir plus bas), pas ici en haut de
// fichier : un import npm: de premier niveau qui échoue à résoudre empêche la
// fonction entière de démarrer (y compris l'envoi d'email), ce qui s'est produit
// en test (504 sur la simple requête OPTIONS, avant même tout traitement).

const VAPID_PUBLIC_KEY = "BAYWoYbzpxn-poxeKn-7CPccnX-aGN5y8kXLVCgcgC8a025oz8HMdNj7E36VLgtiD-oV71KhgCECdQGL85kidOk";

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

async function sendEmail(to: string, subject: string, html: string) {
  const user = Deno.env.get("GMAIL_USER");
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) throw new Error("Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).");
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: user, password: pass },
    },
  });
  try {
    await client.send({ from: user, to: [to], subject, content: "Ce message nécessite un client de messagerie compatible HTML.", html });
  } finally {
    await client.close();
  }
}

function alerteEmailHtml(opts: { nom: string; date: string; userAgent: string }) {
  return `
    <div style="font-family:'Nunito',Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#4A3F9F;margin:0 0 4px">Nouvelle connexion détectée</h2>
      <p style="color:#8E8AA8;margin:0 0 20px">Bonjour ${opts.nom || ""},</p>
      <div style="background:#F1EFF7;border-radius:16px;padding:20px;margin-bottom:18px">
        <p style="margin:0 0 8px;color:#2B2740"><strong>Date :</strong> ${opts.date}</p>
        <p style="margin:0;color:#2B2740"><strong>Appareil/navigateur :</strong> ${opts.userAgent}</p>
      </div>
      <p style="color:#2B2740;font-size:14px;line-height:1.6">
        Votre compte Koala Kids vient de se connecter depuis un appareil ou un navigateur
        jamais utilisé jusqu'ici. Si c'est bien vous, vous pouvez ignorer ce message.
        Si ce n'est <strong>pas</strong> vous, changez votre mot de passe dès maintenant
        (page Réglages) et prévenez la direction.
      </p>
    </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";

  const sbAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await sbAuth.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "non_authentifie" }, 401);
  const user = userData.user;

  let body: { user_agent?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const userAgent = body.user_agent || "inconnu";
  const date = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Identifie la personne (référent·e direction/référente, ou collaborateur·rice)
  // pour son nom et, pour un·e référent·e, ses abonnements push.
  let nom = "";
  let referentId: string | null = null;
  const { data: referent } = await admin
    .from("referents").select("id, name, email").eq("user_id", user.id).maybeSingle();
  if (referent) {
    nom = referent.name || "";
    referentId = referent.id;
  } else {
    const { data: employe } = await admin
      .from("employes").select("prenom, nom").eq("user_id", user.id).maybeSingle();
    if (employe) nom = `${employe.prenom || ""} ${employe.nom || ""}`.trim();
  }

  const results: Record<string, unknown> = {};

  // --- Push (si abonné) ---
  try {
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    if (referentId && vapidPrivate) {
      const { data: subs } = await admin
        .from("push_subscriptions").select("id, endpoint, p256dh, auth_key").eq("referent_id", referentId);
      if (subs?.length) {
        const { default: webpush } = await import("npm:web-push@3.6.7");
        webpush.setVapidDetails("mailto:koalakids.app@gmail.com", VAPID_PUBLIC_KEY, vapidPrivate);
        const payload = JSON.stringify({
          title: "Nouvelle connexion détectée",
          body: `Connexion depuis un appareil non reconnu — ${date}`,
          url: "./parametres.html",
          tag: "kk-alerte-connexion",
        });
        await Promise.all(subs.map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
              payload,
            );
          } catch (e) {
            // Abonnement expiré/révoqué côté navigateur : on le retire.
            if (e?.statusCode === 404 || e?.statusCode === 410) {
              await admin.from("push_subscriptions").delete().eq("id", s.id);
            } else {
              console.error("[envoyer-alerte-connexion] push", e);
            }
          }
        }));
        results.push_sent = subs.length;
      }
    }
  } catch (e) {
    console.error("[envoyer-alerte-connexion] push", e);
  }

  // --- Email (toujours, en secours) ---
  try {
    const email = referent?.email || user.email;
    if (email) {
      await sendEmail(email, "Nouvelle connexion détectée — Koala Kids", alerteEmailHtml({ nom, date, userAgent }));
      results.email_sent = true;
    }
  } catch (e) {
    console.error("[envoyer-alerte-connexion] email", e);
    results.email_error = (e as Error).message;
  }

  return json({ ok: true, ...results });
});
