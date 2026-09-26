import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = (Deno.env.get("VAPID_PUBLIC_KEY") || "").trim();
const vapidPrivateKey = (Deno.env.get("VAPID_PRIVATE_KEY") || "").trim();
const fromEmailDefaut = Deno.env.get("FROM_EMAIL") || "contact@koalakids.fr";

const sb = createClient(supabaseUrl, serviceRoleKey);

let vapidError = null;
try {
  webpush.setVapidDetails(`mailto:${fromEmailDefaut}`, vapidPublicKey, vapidPrivateKey);
} catch (e) {
  vapidError = "Clés VAPID invalides : " + e.message;
  console.error(vapidError);
}

/** org_id déduit d'un des référents destinataires — sert à retrouver la
 *  config réseau et l'adresse d'expédition de son organisation. */
async function resolveOrgId(referentIds) {
  if (!referentIds || !referentIds.length) return null;
  const { data } = await sb.from("referents").select("org_id").eq("id", referentIds[0]).maybeSingle();
  return data?.org_id || null;
}
async function resolveFromEmail(orgId) {
  if (!orgId) return fromEmailDefaut;
  const { data } = await sb.from("organisations").select("email_expediteur").eq("id", orgId).maybeSingle();
  return data?.email_expediteur || fromEmailDefaut;
}

function estEnSilence(debut, fin) {
  const maintenant = new Date().toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  if (debut === fin) return false;
  if (debut < fin) {
    return maintenant >= debut && maintenant < fin;
  } else {
    return maintenant >= debut || maintenant < fin;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (vapidError) {
    return new Response(JSON.stringify({ error: vapidError }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" }
    });
  }

  try {
    const { referent_ids, title, body, url, tag } = await req.json();
    if (!referent_ids || !referent_ids.length || !title) {
      return new Response(JSON.stringify({ error: "referent_ids et title requis" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const orgId = await resolveOrgId(referent_ids);

    const { data: cfgRow } = orgId
      ? await sb.from("reseau_config").select("config").eq("org_id", orgId).maybeSingle()
      : { data: null };
    const cfg = (cfgRow && cfgRow.config) || {};
    const debut = cfg.notif_silence_debut || "19:00";
    const fin = cfg.notif_silence_fin || "08:00";

    // Le mailto: VAPID est un contact technique pour le service de push, pas
    // une adresse visible par les familles/référents ; on le fait correspondre
    // à l'organisation par cohérence plutôt que par nécessité fonctionnelle.
    try {
      webpush.setVapidDetails(`mailto:${await resolveFromEmail(orgId)}`, vapidPublicKey, vapidPrivateKey);
    } catch (e) {
      console.error("[notify-push] setVapidDetails", e);
    }

    if (estEnSilence(debut, fin)) {
      console.log("[notify-push] skipped (silence)", { referent_ids });
      return new Response(JSON.stringify({ skipped: true, reason: "silence" }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const { data: subs, error } = await sb
      .from("push_subscriptions")
      .select("*")
      .in("referent_id", referent_ids);
    if (error) throw error;

    const payload = JSON.stringify({
      title,
      body: body || "",
      url: url || "./demandes.html",
      tag: tag || "koala-notif"
    });

    // DEBUG TEMPORAIRE : on garde le détail de chaque erreur pour diagnostiquer.
    const details = [];
    const resultats = await Promise.allSettled(
      (subs || []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
            payload
          );
          details.push({ id: s.id, ok: true });
        } catch (e) {
          details.push({
            id: s.id,
            ok: false,
            statusCode: e.statusCode || null,
            message: e.message || String(e),
            body: e.body || null
          });
          if (e.statusCode === 404 || e.statusCode === 410) {
            await sb.from("push_subscriptions").delete().eq("id", s.id);
          }
          throw e;
        }
      })
    );

    const envoyes = resultats.filter((r) => r.status === "fulfilled").length;
    // Log explicite pour diagnostiquer les échecs silencieux (HTTP 200 même si envoyes=0).
    console.log("[notify-push] résultat", JSON.stringify({ referent_ids, total: (subs || []).length, envoyes, details }));
    return new Response(
      JSON.stringify({ envoyes, total: (subs || []).length, details }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});
