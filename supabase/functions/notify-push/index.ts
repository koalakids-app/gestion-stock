import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { estGestionnaire, estServiceRole, identifierAppelant } from "../_shared/appelant.ts";

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
async function resolveOrgId(referentIds, employeIds, accesIds = []) {
  if (referentIds && referentIds.length) {
    const { data } = await sb.from("referents").select("org_id").eq("id", referentIds[0]).maybeSingle();
    if (data?.org_id) return data.org_id;
  }
  if (employeIds && employeIds.length) {
    // Un·e employé·e n'a pas d'org_id : on passe par sa crèche.
    const { data: emp } = await sb.from("employes").select("creche_id").eq("id", employeIds[0]).maybeSingle();
    if (emp?.creche_id) {
      const { data: cr } = await sb.from("creches").select("org_id").eq("id", emp.creche_id).maybeSingle();
      return cr?.org_id || null;
    }
  }
  if (accesIds && accesIds.length) {
    // Une famille : on passe par la crèche de son accès.
    const { data: ac } = await sb.from("famille_acces").select("creche_id").eq("id", accesIds[0]).maybeSingle();
    if (ac?.creche_id) {
      const { data: cr } = await sb.from("creches").select("org_id").eq("id", ac.creche_id).maybeSingle();
      return cr?.org_id || null;
    }
  }
  return null;
}
async function resolveFromEmail(orgId) {
  if (!orgId) return fromEmailDefaut;
  const { data } = await sb.from("organisations").select("email_expediteur").eq("id", orgId).maybeSingle();
  return data?.email_expediteur || fromEmailDefaut;
}

/** Jours fériés français : fixes + ceux qui dépendent de Pâques (même calcul que relances-devis-auto). */
function feries(an: number): Set<string> {
  const a = an % 19, b = Math.floor(an / 100), c = an % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  const paques = new Date(Date.UTC(an, mois - 1, jour));
  const plus = (n: number) => new Date(paques.getTime() + n * 86400000);
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  const fixe = (mm: number, dd: number) => `${an}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  return new Set([
    fixe(1, 1), fixe(5, 1), fixe(5, 8), fixe(7, 14), fixe(8, 15), fixe(11, 1), fixe(11, 11), fixe(12, 25),
    iso(plus(1)), iso(plus(39)), iso(plus(50))
  ]);
}

/** Silence = plage horaire du réseau, ou journée entière (samedi, dimanche, jour férié)
 *  si la case correspondante n'est pas décochée dans Paramètres (cochée par défaut). */
function estEnSilence(cfg) {
  const debut = cfg.notif_silence_debut || "19:00";
  const fin = cfg.notif_silence_fin || "08:00";
  const maintenant = new Date().toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const jourIso = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const semaine = new Date().toLocaleDateString("en-US", { timeZone: "Europe/Paris", weekday: "short" });
  if (semaine === "Sat" && cfg.notif_silence_samedi !== false) return true;
  if (semaine === "Sun" && cfg.notif_silence_dimanche !== false) return true;
  if (cfg.notif_silence_feries !== false && feries(parseInt(jourIso.slice(0, 4), 10)).has(jourIso)) return true;
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
    let { referent_ids: refIn, employe_ids: empIn, acces_ids: accIn, title, body, url, tag } = await req.json();
    let referent_ids = Array.isArray(refIn) ? refIn.slice(0, 200) : [];
    let employe_ids = Array.isArray(empIn) ? empIn.slice(0, 200) : [];
    // Familles (Espace famille) : identifiants d'accès famille_acces. Sans compte ni file d'attente :
    // pendant le silence rien n'est retenu, l'information reste lisible dans l'onglet Infos.
    let acces_ids = Array.isArray(accIn) ? accIn.slice(0, 200) : [];
    if ((!referent_ids.length && !employe_ids.length && !acces_ids.length) || !title) {
      return new Response(JSON.stringify({ error: "referent_ids (ou employe_ids, acces_ids) et title requis" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    // Appelant identifié (sinon n'importe qui avec la clé anon pouvait envoyer une notification
    // de son choix à n'importe quel appareil). Les appels internes (cron, relances) passent par la clé service.
    if (!estServiceRole(req)) {
      const appelant = await identifierAppelant(sb, req);
      if (!appelant) {
        return new Response(JSON.stringify({ error: "authentification_manquante" }), {
          status: 401, headers: { ...cors, "Content-Type": "application/json" }
        });
      }
      // Contenu court ; lien interne seulement (page .html du site), sinon page par défaut.
      title = String(title).slice(0, 120);
      body = body ? String(body).slice(0, 300) : body;
      tag = tag ? String(tag).slice(0, 80) : tag;
      if (!url || !/^(\.\/)?[A-Za-z0-9_-]+\.html([?#][^\s]*)?$/.test(String(url))) url = "./demandes.html";

      // Destinataires limités à l'organisation de l'appelant·e ; familles et employé·es : direction/référent·es seulement.
      const org = appelant.orgId;
      if (referent_ids.length) {
        const { data } = await sb.from("referents").select("id").in("id", referent_ids).eq("org_id", org);
        referent_ids = (data || []).map((r) => r.id);
      }
      if (!estGestionnaire(appelant)) {
        employe_ids = [];
        acces_ids = [];
      } else {
        if (employe_ids.length) {
          const { data: emps } = await sb.from("employes").select("id, creche_id").in("id", employe_ids);
          const crIds = [...new Set((emps || []).map((e) => e.creche_id).filter(Boolean))];
          const { data: crs } = crIds.length
            ? await sb.from("creches").select("id").in("id", crIds).eq("org_id", org)
            : { data: [] };
          const okCr = new Set((crs || []).map((c) => c.id));
          employe_ids = (emps || []).filter((e) => okCr.has(e.creche_id)).map((e) => e.id);
        }
        if (acces_ids.length) {
          const { data } = await sb.from("famille_acces").select("id").in("id", acces_ids).eq("org_id", org);
          acces_ids = (data || []).map((a) => a.id);
        }
      }
      if (!referent_ids.length && !employe_ids.length && !acces_ids.length) {
        return new Response(JSON.stringify({ error: "destinataires_non_autorises" }), {
          status: 403, headers: { ...cors, "Content-Type": "application/json" }
        });
      }
    }

    const orgId = await resolveOrgId(referent_ids, employe_ids, acces_ids);

    const { data: cfgRow } = orgId
      ? await sb.from("reseau_config").select("config").eq("org_id", orgId).maybeSingle()
      : { data: null };
    const cfg = (cfgRow && cfgRow.config) || {};

    // Le mailto: VAPID est un contact technique pour le service de push, pas
    // une adresse visible par les familles/référents ; on le fait correspondre
    // à l'organisation par cohérence plutôt que par nécessité fonctionnelle.
    try {
      webpush.setVapidDetails(`mailto:${await resolveFromEmail(orgId)}`, vapidPublicKey, vapidPrivateKey);
    } catch (e) {
      console.error("[notify-push] setVapidDetails", e);
    }

    if (estEnSilence(cfg)) {
      // Retenue plutôt qu'abandonnée : livrée à la première connexion hors silence (plage horaire, week-end, férié)
      // (livrerNotifsRetenues côté page Demandes). sql/notifs_retenues.sql
      // Les employé·es n'ont pas de file d'attente : leur message reste dans Mon espace,
      // signalé comme non lu (sql/messages_employes.sql).
      const lignes = referent_ids.map((rid) => ({
        referent_id: rid,
        title,
        body: body || "",
        url: url || "./demandes.html",
        tag: tag || "koala-notif"
      }));
      const { error: errRetenue } = lignes.length
        ? await sb.from("notifs_retenues").insert(lignes)
        : { error: null };
      if (errRetenue) console.error("[notify-push] retenue", errRetenue);
      console.log("[notify-push] retenue (silence)", { referent_ids, employe_ids, acces_ids: acces_ids.length, ok: !errRetenue });
      return new Response(JSON.stringify({ skipped: true, reason: "silence", retenues: errRetenue ? 0 : lignes.length }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    let subs = [];
    if (referent_ids.length) {
      const { data, error } = await sb.from("push_subscriptions").select("*").in("referent_id", referent_ids);
      if (error) throw error;
      subs = subs.concat(data || []);
    }
    if (employe_ids.length) {
      const { data, error } = await sb.from("push_subscriptions").select("*").in("employe_id", employe_ids);
      if (error) throw error;
      subs = subs.concat(data || []);
    }

    if (acces_ids.length) {
      // Seuls les accès encore actifs (un accès révoqué ne reçoit plus rien).
      const { data: actifs, error: eAct } = await sb.from("famille_acces").select("id").in("id", acces_ids).eq("actif", true);
      if (eAct) throw eAct;
      const ids = (actifs || []).map((a) => a.id);
      if (ids.length) {
        const { data, error } = await sb.from("famille_push").select("*").in("acces_id", ids);
        if (error) throw error;
        subs = subs.concat((data || []).map((d) => ({ ...d, _table: "famille_push" })));
      }
    }

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
          const cible = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } };
          try {
            await webpush.sendNotification(cible, payload);
          } catch (e1) {
            // Une seule nouvelle tentative sur erreur passagère (429 / 5xx / réseau) ;
            // 404 et 410 = abonnement mort, inutile de réessayer.
            const sc = e1.statusCode;
            if (sc === 404 || sc === 410 || (sc && sc >= 400 && sc < 429)) throw e1;
            await new Promise((r) => setTimeout(r, 1500));
            await webpush.sendNotification(cible, payload);
          }
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
            await sb.from(s._table || "push_subscriptions").delete().eq("id", s.id);
          }
          throw e;
        }
      })
    );

    const envoyes = resultats.filter((r) => r.status === "fulfilled").length;
    // Log explicite pour diagnostiquer les échecs silencieux (HTTP 200 même si envoyes=0).
    console.log("[notify-push] résultat", JSON.stringify({ referent_ids, employe_ids, acces_ids: acces_ids.length, total: (subs || []).length, envoyes, details }));
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
