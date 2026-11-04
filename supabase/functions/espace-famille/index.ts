// Edge function "espace-famille"
// ============================================================================
// API publique (aucune session Supabase) pour espace-famille.html : l'espace d'une
// famille, ouvert avec un code personnel (8 caractères) ou le lien qui le contient.
// Tout passe ici en service_role ; la page ne lit aucune table directement.
//
// Le « jeton » reçu (via _shared/session-lien.ts) est soit le code court, soit le
// uuid du lien : il est vérifié en base à chaque appel. Les échecs de saisie sont
// comptés par adresse IP (famille_essais) : 10 échecs / 15 min => 429.
//
// Actions (POST, JSON) :
//   {action:'get'}    -> {enfant:{prenom, code_pictos}, creche_nom, parent:{prenom}, messages:[...],
//                         depots:[...], suivi_token}
//   {action:'document', doc_id} -> {url} (PDF devis / contrat, lien signé de 2 min)
//   {action:'upload', libelle, filename, content_type, content_base64}
//
// Déploiement : supabase functions deploy espace-famille --no-verify-jwt
// ============================================================================
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resoudreJeton } from "../_shared/session-lien.ts";
import { signalerDepot } from "../_shared/depot-externe.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const erreur = (m: string, s = 400) => json({ erreur: m }, s);

const BUCKET = "documents-admin";
const MAX_BYTES = 8 * 1024 * 1024;
const ESSAIS_MAX = 10;
const FENETRE_MIN = 15;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  heic: "image/heic", heif: "image/heif", pdf: "application/pdf",
};

const RESEAU_CFG_ID = "00000000-0000-0000-0000-000000000003";

/** Documents PDF mis à disposition de CET enfant : contrats signés de l'enfant et devis de ses contrats. */
async function documentsDeLEnfant(sb: any, enfantId: string) {
  const { data: contrats } = await sb.from("contrats").select("id, devis_id, statut").eq("enfant_id", enfantId);
  const sources = [
    ...(contrats || []).filter((c: any) => ["signe", "contresigne"].includes(c.statut)).map((c: any) => c.id),
    ...(contrats || []).map((c: any) => c.devis_id).filter(Boolean),
  ];
  if (!sources.length) return [];
  const { data } = await sb.from("famille_documents")
    .select("id, type, titre, path, publie_le").in("source_id", sources).order("publie_le", { ascending: false });
  return data || [];
}

/** Fermetures à venir : celles de la crèche + celles communes au réseau, sans doublon. */
async function fermeturesAVenir(sb: any, crecheId: string) {
  const { data: creche } = await sb.from("creches").select("org_id").eq("id", crecheId).maybeSingle();
  // reseau_config est propre à chaque organisation ; ligne historique Koala Kids en secours.
  const [{ data: etab }, { data: res }] = await Promise.all([
    sb.from("etablissements").select("jours_fermeture").eq("creche_id", crecheId).maybeSingle(),
    creche?.org_id
      ? sb.from("reseau_config").select("config").eq("org_id", creche.org_id).maybeSingle()
      : sb.from("reseau_config").select("config").eq("id", RESEAU_CFG_ID).maybeSingle(),
  ]);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const liste = [
    ...(Array.isArray(etab?.jours_fermeture) ? etab.jours_fermeture : []),
    ...(Array.isArray(res?.config?.jours_fermeture_reseau) ? res.config.jours_fermeture_reseau : []),
  ].filter((f: any) => f && f.debut && (f.fin || f.debut) >= aujourdhui)
    .map((f: any) => ({ debut: f.debut, fin: f.fin || f.debut, type: f.type || "", label: f.label || "" }));
  const vus = new Set<string>();
  return liste.filter((f: any) => {
    const k = `${f.debut}|${f.fin}|${f.label}`;
    return vus.has(k) ? false : (vus.add(k), true);
  }).sort((a: any, b: any) => a.debut.localeCompare(b.debut));
}

const ORDRE_ROLES = ["directeur", "coordinateur", "gestionnaire", "autre"];
const texteCourt = (v: unknown, max = 120) => String(v ?? "").trim().slice(0, max);

/** Coordonnées de la crèche + personnes à contacter (directeur de la crèche, coordinateur et
 *  gestionnaire du réseau), saisies par la direction dans Paramètres. Rien n'est déduit des comptes. */
async function contactsDeLaCreche(sb: any, crecheId: string) {
  const { data: creche } = await sb.from("creches").select("name, addr, org_id").eq("id", crecheId).maybeSingle();
  const [{ data: etab }, { data: res }] = await Promise.all([
    sb.from("etablissements").select("telephone, email, contacts_famille, heure_ouverture, heure_fermeture")
      .eq("creche_id", crecheId).maybeSingle(),
    creche?.org_id
      ? sb.from("reseau_config").select("config").eq("org_id", creche.org_id).maybeSingle()
      : sb.from("reseau_config").select("config").eq("id", RESEAU_CFG_ID).maybeSingle(),
  ]);
  const brut = [
    ...(Array.isArray(etab?.contacts_famille) ? etab.contacts_famille : []),
    ...(Array.isArray(res?.config?.contacts_famille_reseau) ? res.config.contacts_famille_reseau : []),
  ];
  const personnes = brut.filter((c: any) => c && c.nom && (c.telephone || c.email)).map((c: any) => ({
    role: ORDRE_ROLES.includes(c.role) ? c.role : "autre",
    nom: texteCourt(c.nom), fonction: texteCourt(c.fonction),
    telephone: texteCourt(c.telephone, 30), email: texteCourt(c.email),
  })).sort((a: any, b: any) => ORDRE_ROLES.indexOf(a.role) - ORDRE_ROLES.indexOf(b.role));
  return {
    creche: {
      nom: creche?.name || "", adresse: creche?.addr || "",
      telephone: etab?.telephone || "", email: etab?.email || "",
      ouverture: etab?.heure_ouverture || "", fermeture: etab?.heure_fermeture || "",
    },
    personnes,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erreur("method_not_allowed", 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return erreur("corps_invalide"); }
  const action = body.action as string;

  const r = await resoudreJeton(body, "espace-famille");
  if ("reponse" in r) return r.reponse;
  const saisie = r.token.trim();

  const sb: any = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const ip = (req.headers.get("x-forwarded-for") || "inconnue").split(",")[0].trim();
  const depuis = new Date(Date.now() - FENETRE_MIN * 60000).toISOString();
  const { count: echecs } = await sb.from("famille_essais")
    .select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", depuis);
  if ((echecs ?? 0) >= ESSAIS_MAX) return erreur("trop_d_essais", 429);

  const colonne = UUID.test(saisie) ? "token" : "code";
  const valeur = colonne === "code" ? saisie.toUpperCase().replace(/[\s-]/g, "") : saisie;
  const { data: acces, error: aErr } = await sb.from("famille_acces")
    .select("id, enfant_id, creche_id, parent_id, actif").eq(colonne, valeur).maybeSingle();
  if (aErr) { console.error("[espace-famille] lecture accès", aErr); return erreur("erreur_lecture", 500); }
  if (!acces) {
    await sb.from("famille_essais").insert({ ip });
    return erreur("introuvable", 404);
  }
  if (!acces.actif) return erreur("revoque", 410);

  const [{ data: enfant }, { data: parent }] = await Promise.all([
    sb.from("enfants").select("prenom, code_pictos").eq("id", acces.enfant_id).maybeSingle(),
    sb.from("enfants_parents").select("prenom").eq("id", acces.parent_id).maybeSingle(),
  ]);

  if (action === "get") {
    const { data: creche } = await sb.from("creches").select("name").eq("id", acces.creche_id).maybeSingle();
    const { data: msgs, error: mErr } = await sb.from("famille_messages")
      .select("id, titre, corps, auteur_nom, created_at")
      .eq("creche_id", acces.creche_id)
      .or(`enfant_id.is.null,enfant_id.eq.${acces.enfant_id}`)
      .order("created_at", { ascending: false }).limit(50);
    if (mErr) { console.error("[espace-famille] messages", mErr); return erreur("erreur_lecture", 500); }

    const { data: lus } = await sb.from("famille_messages_lus").select("message_id").eq("acces_id", acces.id);
    const dejaLus = new Set((lus || []).map((l: any) => l.message_id));
    const nouveaux = (msgs || []).filter((m: any) => !dejaLus.has(m.id));
    if (nouveaux.length) {
      await sb.from("famille_messages_lus").upsert(
        nouveaux.map((m: any) => ({ message_id: m.id, acces_id: acces.id })),
        { onConflict: "message_id,acces_id", ignoreDuplicates: true });
    }
    await sb.from("famille_acces").update({ derniere_connexion: new Date().toISOString() }).eq("id", acces.id);

    const { data: depots } = await sb.from("enfants_documents_admin")
      .select("filename, created_at").eq("enfant_id", acces.enfant_id)
      .like("piece_key", "espace_famille:%").order("created_at", { ascending: false }).limit(30);

    // Lien vers le suivi de l'enfant (synthèses publiées), s'il existe pour ce parent.
    const { data: suivi } = await sb.from("suivi_acces_famille").select("token")
      .eq("enfant_id", acces.enfant_id).eq("parent_id", acces.parent_id).eq("actif", true).maybeSingle();

    const documents = (await documentsDeLEnfant(sb, acces.enfant_id))
      .map((d: any) => ({ id: d.id, type: d.type, titre: d.titre, date: d.publie_le }));
    const fermetures = await fermeturesAVenir(sb, acces.creche_id);
    const contacts = await contactsDeLaCreche(sb, acces.creche_id);

    return json({
      documents,
      fermetures,
      contacts,
      creche_id: acces.creche_id,
      // Code image du pointage sur la tablette (4 pictogrammes, dans l'ordre). Seules les images
      // sont renvoyées, jamais le code numérique interne (enfants.code_pointage).
      enfant: {
        prenom: enfant?.prenom || "",
        code_pictos: Array.isArray(enfant?.code_pictos) && enfant.code_pictos.length === 4
          ? enfant.code_pictos : null,
      },
      creche_nom: creche?.name || "",
      parent: { prenom: parent?.prenom || "" },
      messages: (msgs || []).map((m: any) => ({ ...m, nouveau: !dejaLus.has(m.id) })),
      depots: (depots || []).map((d: any) => ({ nom: d.filename, date: d.created_at })),
      suivi_token: suivi?.token || null,
    });
  }

  if (action === "document") {
    const docId = String(body.doc_id || "");
    const doc = (await documentsDeLEnfant(sb, acces.enfant_id)).find((d: any) => d.id === docId);
    if (!doc) return erreur("introuvable", 404);
    const { data: signe, error: sErr } = await sb.storage.from("famille-docs").createSignedUrl(doc.path, 120);
    if (sErr || !signe?.signedUrl) { console.error("[espace-famille] url signée", sErr); return erreur("erreur_lecture", 500); }
    return json({ url: signe.signedUrl, titre: doc.titre });
  }

  if (action === "upload") {
    const libelle = String(body.libelle || "").trim().slice(0, 120);
    const filename = String(body.filename || "fichier").trim().slice(0, 150);
    const ext = (filename.split(".").pop() || "").toLowerCase();
    const fourni = String(body.content_type || "").toLowerCase().replace("image/jpg", "image/jpeg");
    const contentType = Object.values(TYPES).includes(fourni) ? fourni : (TYPES[ext] || fourni);
    if (!Object.values(TYPES).includes(contentType)) return erreur("format_non_accepte");
    if (!libelle) return erreur("libelle_manquant");
    const b64 = body.content_base64 as string;
    if (!b64) return erreur("fichier_manquant");

    let bytes: Uint8Array;
    try {
      const bin = atob(b64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch { return erreur("fichier_invalide"); }
    if (bytes.byteLength > MAX_BYTES) return erreur("fichier_trop_volumineux");

    const path = `${acces.enfant_id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext || "bin"}`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType });
    if (upErr) { console.error("[espace-famille] upload", upErr); return erreur("upload_impossible", 500); }

    const { error: insErr } = await sb.from("enfants_documents_admin").insert({
      enfant_id: acces.enfant_id, bucket: BUCKET, path,
      filename: `${libelle} — ${filename}`, piece_key: `espace_famille:${libelle}`.slice(0, 160),
    });
    if (insErr) {
      console.error("[espace-famille] enregistrement", insErr);
      await sb.storage.from(BUCKET).remove([path]).catch(() => {});
      return erreur("enregistrement_impossible", 500);
    }
    await signalerDepot(sb, {
      source: "enfant", creche_id: acces.creche_id, enfant_id: acces.enfant_id,
      libelle: `${libelle} (espace famille)`, nom: enfant?.prenom || "Un enfant",
    });
    return json({ ok: true });
  }

  return erreur("action_inconnue");
});
