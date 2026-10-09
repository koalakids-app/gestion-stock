// ============================================================================
// supabase/functions/dossier-stagiaire/index.ts
// Koala Kids — septembre 2026  ·  Module Stagiaires et alternants
//
// La porte d'entrée de stagiaire.html. C'est la SEULE façon dont une stagiaire
// ou un alternant touche à la base : la page publique n'a aucun accès aux
// tables (voir 23b-stagiaires-policies.sql, qui ne crée aucune policy anon),
// ni au bucket (privé, voir 23c).
//
// Cette fonction s'exécute en service_role et contourne donc la RLS. Tout son
// travail consiste à ne rien laisser sortir ni entrer qui ne corresponde pas au
// jeton reçu. Trois règles, dans cet ordre, avant toute lecture ou écriture :
//   1. le jeton existe ;
//   2. il n'est ni expiré ni rattaché à un stage annulé ;
//   3. la pièce déposée correspond à un type actif du catalogue ET demandée au
//      profil du dossier (stagiaire ou alternant — script 31).
//
// Le lien circule dans les DEUX SENS depuis le script 36 : la personne dépose
// ses pièces, et reçoit ce que la crèche lui transmet — projet pédagogique en
// pièce jointe, questionnaire sous forme de lien. La règle 3 vaut aussi pour
// ces ressources : une ressource inactive, réservée à l'autre profil ou à une
// autre crèche n'existe pas, et son fichier n'est jamais signé.
//
// Le lien n'ouvre qu'une SESSION COURTE (voir _shared/session-lien.ts) : la
// page l'échange contre une session signée (action `ouvrir`) puis ne renvoie
// plus que celle-ci. Elle expire à l'inactivité ; le jeton, lui, est toujours
// contrôlé en base à chaque appel (règles 1 et 2).
//
// DÉPLOIEMENT — la stagiaire n'a pas de compte, donc pas de JWT :
//   supabase functions deploy dossier-stagiaire --no-verify-jwt
//
// Sans --no-verify-jwt, toutes les requêtes des stagiaires seront rejetées en 401.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resoudreJeton } from '../_shared/session-lien.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const BUCKET = 'stagiaires';

// 12 Mo : une photo de téléphone récent pèse 3 à 6 Mo, un PDF scanné de
// convention en 3 pages guère plus. Au-delà, c'est une vidéo ou une erreur.
const TAILLE_MAX = 12 * 1024 * 1024;

// Le lien de lecture d'un document transmis vaut 5 minutes, comme côté
// application. Le transférer ne sert à rien.
const URL_TTL = 300;

// Ce qu'on accepte de recevoir. Une pièce d'identité arrive en photo, une
// convention en PDF ; rien d'autre n'a de raison d'être déposé ici, et un
// exécutable ou une archive dans un bucket n'a que des inconvénients.
const MIMES_OK = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'];

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic',
  'image/heif': 'heif', 'image/webp': 'webp', 'application/pdf': 'pdf',
};

/** Le profil du dossier. Une base d'avant le script 31 n'a pas la colonne :
 *  c'est alors une stagiaire, comme avant. */
const profilDe = (stag: Record<string, unknown>) =>
  stag.type_contrat === 'alternant' ? 'alternant' : 'stagiaire';

/** Charge la stagiaire depuis son jeton et refuse tout ce qui n'est plus valable. */
async function stagiaireValide(token: string) {
  if (!token || typeof token !== 'string' || token.length < 16) {
    throw new Error('Jeton introuvable');
  }
  const { data, error } = await sb
    .from('stagiaires')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (error) throw new Error('Lecture impossible');
  if (!data) throw new Error('Jeton introuvable');
  if (data.statut === 'annule' || data.statut === 'refuse') throw new Error('Lien expiré');
  if (!data.token_expire_le || new Date(data.token_expire_le).getTime() < Date.now()) {
    throw new Error('Lien expiré');
  }
  return data;
}

/** Le catalogue des pièces demandées à CE profil, dans l'ordre d'affichage.
 *
 *  Le filtre est fait ici, en base, et non côté page : une pièce réservée aux
 *  stagiaires ne doit pas seulement être cachée à un alternant, elle ne doit
 *  pas non plus pouvoir servir de destination à un dépôt (voir règle 3).
 *
 *  `pour_type` peut ne pas exister (script 31 non exécuté) : on retombe alors
 *  sur le catalogue entier plutôt que de laisser la page vide. */
async function catalogue(profil: string) {
  const { data, error } = await sb
    .from('stagiaires_docs_types')
    .select('id,libelle,aide,lien,obligatoire,ordre,pour_type')
    .eq('actif', true)
    .in('pour_type', ['tous', profil])
    .order('ordre');
  if (!error) return data || [];

  const { data: brut } = await sb
    .from('stagiaires_docs_types')
    .select('id,libelle,aide,lien,obligatoire,ordre')
    .eq('actif', true)
    .order('ordre');
  return brut || [];
}

/** Ce que la stagiaire a déjà déposé. Jamais le chemin de stockage : elle n'en
 *  a pas l'usage, et le donner reviendrait à publier l'emplacement du fichier. */
async function deposes(stagiaireId: string) {
  const { data } = await sb
    .from('stagiaires_documents')
    .select('id,type_id,libelle,filename,statut,commentaire,created_at')
    .eq('stagiaire_id', stagiaireId)
    .order('created_at');
  return data || [];
}

// ---------------------------------------------------------------------------
// Ce que la crèche transmet (script 36)
// ---------------------------------------------------------------------------

/** Les ressources destinées à CE dossier : actives, prévues pour ce profil, et
 *  soit valables pour tout le réseau (creche_id null), soit pour sa crèche.
 *
 *  Le filtre est fait ici pour la même raison que le catalogue : il ne suffit
 *  pas de cacher une ressource, il faut qu'elle ne puisse pas non plus être
 *  demandée par son identifiant.
 *
 *  Table absente (script 36 non exécuté) : liste vide, la page se comporte
 *  comme avant plutôt que d'afficher une erreur. */
async function ressourcesDe(profil: string, crecheId: unknown) {
  // select('*') et non une liste de colonnes : une colonne ajoutée par un
  // script ultérieur (36d) ferait échouer la requête entière sur une base qui
  // ne l'a pas encore — et la page n'afficherait plus rien du tout.
  const { data, error } = await sb
    .from('stagiaires_ressources')
    .select('*')
    .eq('actif', true)
    .in('pour_type', ['tous', profil])
    .order('ordre');
  if (error) return [];
  return (data || []).filter(r =>
    !r.creche_id || String(r.creche_id) === String(crecheId || ''));
}

/** Le suivi de lecture de cette personne, indexé par ressource. */
async function vuesDe(stagiaireId: string) {
  const { data } = await sb
    .from('stagiaires_ressources_vues')
    .select('ressource_id,ouvert_le,accuse_le')
    .eq('stagiaire_id', stagiaireId);
  const m = new Map<string, { ouvert_le: string | null; accuse_le: string | null }>();
  (data || []).forEach(v => m.set(String(v.ressource_id), v as never));
  return m;
}

/** Pose ou met à jour la ligne de suivi.
 *
 *  `ouvert_le` n'est jamais réécrit : c'est la première consultation qui
 *  compte. `accuse_le` suit la case, et repasse à null si elle est décochée —
 *  une confirmation cochée par erreur doit pouvoir se retirer. */
async function marquer(
  stagiaireId: string,
  ressourceId: string,
  opts: { ouvert?: boolean; accuse?: boolean | null },
) {
  const { data: existante } = await sb
    .from('stagiaires_ressources_vues')
    .select('id,ouvert_le,accuse_le')
    .eq('stagiaire_id', stagiaireId)
    .eq('ressource_id', ressourceId)
    .maybeSingle();

  const now = new Date().toISOString();
  const champs: Record<string, unknown> = {};
  if (opts.ouvert && !(existante && existante.ouvert_le)) champs.ouvert_le = now;
  if (opts.accuse === true) champs.accuse_le = now;
  if (opts.accuse === false) champs.accuse_le = null;

  if (existante) {
    if (!Object.keys(champs).length) return;
    await sb.from('stagiaires_ressources_vues').update(champs).eq('id', existante.id);
    return;
  }
  await sb.from('stagiaires_ressources_vues').insert({
    stagiaire_id: stagiaireId,
    ressource_id: ressourceId,
    ouvert_le: champs.ouvert_le || (opts.ouvert ? now : null),
    accuse_le: champs.accuse_le || null,
  });
}

// ---------------------------------------------------------------------------
// Documents à signer (livret d'accueil du stagiaire, préparé dans documents.html)
// ---------------------------------------------------------------------------

// Seuls ces champs du livret quittent la base : le texte et les coordonnées de la
// crèche. Jamais les notes, ni les données d'un autre document.
const LV_CHAMPS_PUBLICS = ['lv_texte', 'lv_creche', 'lv_adresse', 'lv_capacite', 'lv_gestionnaires', 'lv_ages',
  'lv_horaires', 'lv_accueil', 'lv_equipe', 'sal_nom', 'lv_formation', 'lv_periode', 'lv_tuteur', 'lv_lieu', 'lv_date'];

/** Les livrets que la crèche a mis à signer pour CE dossier. Le rattachement est
 *  fait par la crèche (donnees.lv_stagiaire_id) : un identifiant deviné par le
 *  client ne suffit pas, il faut qu'il corresponde au jeton. */
async function livretsDe(stagiaireId: string) {
  const { data, error } = await sb
    .from('documents_reponses')
    .select('id,document_id,statut,donnees,updated_at')
    .filter('donnees->>lv_stagiaire_id', 'eq', stagiaireId)
    .filter('donnees->>lv_envoye', 'eq', 'true')
    .order('created_at');
  if (error || !data?.length) return [];
  const { data: docs } = await sb
    .from('documents_koala')
    .select('id,titre,template_key')
    .in('id', [...new Set(data.map(r => r.document_id))]);
  const ok = new Map((docs || []).filter(d => d.template_key === 'livret_stagiaire').map(d => [d.id, d]));
  return data.filter(r => ok.has(r.document_id)).map(r => ({ ...r, titre: ok.get(r.document_id)!.titre }));
}

async function empreinte(txt: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Décode le base64 d'un dépôt. Renvoie null si ce n'en est pas. */
function versOctets(b64: string): Uint8Array | null {
  try {
    const brut = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
    const bin = atob(brut);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  try {
    const body = await req.json();
    const action = String(body.action || '');
    // Le lien n'ouvre qu'une session (voir _shared/session-lien.ts) : ensuite la
    // page ne renvoie plus que celle-ci, qui expire à l'inactivité.
    const sess = await resoudreJeton(body, 'dossier-stagiaire');
    if ('reponse' in sess) return sess.reponse;
    const stag = await stagiaireValide(sess.token);
    const profil = profilDe(stag);

    const { data: creche } = stag.creche_id
      ? await sb.from('creches').select('name').eq('id', stag.creche_id).maybeSingle()
      : { data: null };

    // ---------------------------------------------------------------- GET
    if (action === 'get') {
      const types = await catalogue(profil);
      const docs = await deposes(stag.id);
      const parType = new Map<string, any[]>();
      docs.forEach(d => {
        const k = String(d.type_id || 'autre');
        if (!parType.has(k)) parType.set(k, []);
        parType.get(k)!.push(d);
      });

      // Une pièce déposée puis retirée du catalogue de ce profil reste visible
      // dans « autres » : elle a été envoyée, elle ne doit pas disparaître de
      // l'écran de la personne qui l'a envoyée.
      const connus = new Set(types.map(t => String(t.id)));
      const autres: any[] = [];
      parType.forEach((liste, k) => { if (!connus.has(k)) autres.push(...liste); });

      const ress = await ressourcesDe(profil, stag.creche_id);
      const vues = await vuesDe(stag.id);
      const livrets = (await livretsDe(stag.id)).map(r => {
        const d = (r.donnees || {}) as Record<string, any>;
        const champs: Record<string, unknown> = {};
        LV_CHAMPS_PUBLICS.forEach(k => { champs[k] = d[k] ?? ''; });
        return {
          id: r.id,
          titre: r.titre,
          signe: r.statut === 'signe' && !!d._sigs?.salarie,
          signe_le: d._signature?.signe_le || null,
          signature: d._sigs?.salarie || null,
          signature_tuteur: d._sigs?.responsable || null,
          champs,
        };
      });

      return json({
        // On ne renvoie que ce dont la page a besoin : ni identifiants
        // internes autres que ceux des types, ni notes de la crèche, ni bilan.
        stagiaire: {
          prenom: stag.prenom,
          nom: stag.nom,
          creche_nom: creche?.name || '',
          date_debut: stag.date_debut,
          date_fin: stag.date_fin,
          expire_le: stag.token_expire_le,
          // Sert uniquement au vocabulaire de la page (stage / alternance).
          type_contrat: profil,
          // L'identifiant du dossier. Il n'ouvre rien par lui-même — seul le
          // jeton donne accès — mais il permet à un questionnaire maison de
          // rattacher sa réponse à la bonne fiche.
          ref: stag.id,
        },
        livrets,
        pieces: types.map(t => ({
          id: t.id, libelle: t.libelle, aide: t.aide, lien: t.lien,
          obligatoire: t.obligatoire,
          fichiers: parType.get(String(t.id)) || [],
        })),
        autres,
        // Un fichier ne sort JAMAIS d'ici avec son chemin : la page demande une
        // URL signée au moment du clic (action `ressource_url`). Une ressource
        // « lien » n'a rien à cacher, son URL est publique par nature.
        ressources: ress.map(r => {
          const v = vues.get(String(r.id));
          return {
            id: r.id,
            libelle: r.libelle,
            description: r.description,
            nature: r.nature,
            url: r.nature === 'lien' ? r.url : null,
            filename: r.nature === 'fichier' ? r.filename : null,
            accuse: !!r.accuse,
            // Le lien reçoit-il l'identité de la personne ? Faux par défaut :
            // le nom d'une stagiaire n'a pas à partir vers un site tiers sans
            // que ce soit décidé (script 36d).
            identite: r.nature === 'lien' && !!r.transmet_identite,
            ouvert_le: v ? v.ouvert_le : null,
            accuse_le: v ? v.accuse_le : null,
          };
        }),
      });
    }

    // ------------------------------------------------------------- UPLOAD
    if (action === 'upload') {
      const typeId = String(body.type_id || '');
      const types = await catalogue(profil);
      const type = types.find(t => String(t.id) === typeId);
      // Règle 3 : un type inconnu, désactivé, réservé à l'autre profil, ou
      // inventé par le client n'existe pas — même si son identifiant a la
      // bonne forme.
      if (!type) return json({ erreur: 'Pièce inconnue' }, 404);

      const mime = String(body.mime || '');
      if (!MIMES_OK.includes(mime)) {
        return json({ erreur: 'Format non accepté (photo ou PDF uniquement)' }, 400);
      }

      const octets = versOctets(String(body.data || ''));
      if (!octets || !octets.length) return json({ erreur: 'Fichier illisible' }, 400);
      // Le contrôle de taille est refait ici : celui de la page peut être
      // contourné, celui-ci non.
      if (octets.length > TAILLE_MAX) {
        return json({ erreur: 'Fichier trop lourd (12 Mo maximum)' }, 400);
      }

      const path = stag.id + '/' + Date.now() + '_' +
        Math.random().toString(36).slice(2) + '.' + (EXT[mime] || 'bin');

      const { error: upErr } = await sb.storage.from(BUCKET)
        .upload(path, octets, { contentType: mime, upsert: false });
      if (upErr) throw upErr;

      const { data: ligne, error: insErr } = await sb.from('stagiaires_documents').insert({
        stagiaire_id: stag.id,
        type_id: type.id,
        libelle: type.libelle,
        bucket: BUCKET,
        path,
        // Le nom du fichier vient du téléphone de la stagiaire : on le garde
        // pour l'affichage, mais il ne sert jamais de chemin.
        filename: String(body.filename || '').slice(0, 180) || (type.libelle + '.' + (EXT[mime] || 'bin')),
        mime,
        taille: octets.length,
        statut: 'recu',
        depose_par: 'stagiaire',
      }).select('id,type_id,libelle,filename,statut,created_at').maybeSingle();

      if (insErr) {
        // La ligne n'a pas pu être créée : le fichier déposé serait orphelin
        // dans le bucket, invisible de l'application et impossible à retrouver.
        await sb.storage.from(BUCKET).remove([path]);
        throw insErr;
      }

      return json({ document: ligne });
    }

    // ------------------------------------------------------------- DELETE
    // La stagiaire peut retirer une pièce qu'elle vient de déposer — mauvaise
    // photo, mauvais document. Pas une pièce déjà validée par la crèche : à ce
    // stade, c'est à la crèche de décider.
    if (action === 'delete') {
      const id = String(body.document_id || '');
      const { data: doc } = await sb
        .from('stagiaires_documents')
        .select('id,stagiaire_id,bucket,path,statut')
        .eq('id', id)
        .maybeSingle();
      if (!doc || String(doc.stagiaire_id) !== String(stag.id)) {
        return json({ erreur: 'Document introuvable' }, 404);
      }
      if (doc.statut === 'valide') {
        return json({ erreur: 'Cette pièce a été validée par la crèche' }, 409);
      }
      const { error: delErr } = await sb.from('stagiaires_documents').delete().eq('id', doc.id);
      if (delErr) throw delErr;
      // Le fichier part avec la ligne : sinon il resterait dans le bucket,
      // hors de tout dossier et hors de toute suppression future.
      await sb.storage.from(doc.bucket || BUCKET).remove([doc.path]);
      return json({ ok: true });
    }

    // ------------------------------------------------------- RESSOURCE_URL
    // Ouvrir un document transmis (le projet pédagogique, par exemple). Le
    // bucket est privé : le lien est signé maintenant et vaut 5 minutes. La
    // consultation est datée au passage — c'est tout l'intérêt de ne pas
    // envoyer le PDF en pièce jointe d'un mail.
    if (action === 'ressource_url') {
      const id = String(body.ressource_id || '');
      const ress = await ressourcesDe(profil, stag.creche_id);
      const r = ress.find(x => String(x.id) === id);
      if (!r) return json({ erreur: 'Document introuvable' }, 404);
      if (r.nature !== 'fichier' || !r.path) {
        return json({ erreur: 'Document introuvable' }, 404);
      }
      const { data, error } = await sb.storage
        .from(r.bucket || BUCKET)
        .createSignedUrl(r.path, URL_TTL);
      if (error || !data) throw error || new Error('Signature impossible');
      await marquer(stag.id, String(r.id), { ouvert: true });
      return json({ url: data.signedUrl, filename: r.filename || null });
    }

    // ---------------------------------------------------- RESSOURCE_MARQUE
    // Le clic sur un lien externe (questionnaire) et la case de confirmation.
    // Rien de tout cela n'engage la personne : c'est un suivi, pas une
    // signature — et la case peut se décocher.
    if (action === 'ressource_marque') {
      const id = String(body.ressource_id || '');
      const ress = await ressourcesDe(profil, stag.creche_id);
      const r = ress.find(x => String(x.id) === id);
      if (!r) return json({ erreur: 'Document introuvable' }, 404);

      const accuse = body.accuse === true ? true
                   : body.accuse === false ? false
                   : null;
      await marquer(stag.id, String(r.id), { ouvert: body.ouvert !== false, accuse });
      return json({ ok: true });
    }

    // ----------------------------------------------------- LIVRET_SIGNER
    // La stagiaire signe le livret que sa crèche a préparé. Une seule fois : un
    // livret signé ne se modifie plus depuis ce lien (la crèche garde la main).
    if (action === 'livret_signer') {
      const id = String(body.reponse_id || '');
      const rep = (await livretsDe(stag.id)).find(r => String(r.id) === id);
      if (!rep) return json({ erreur: 'Document introuvable' }, 404);
      if (rep.statut === 'signe') return json({ erreur: 'Document déjà signé' }, 409);

      const png = String(body.signature || '');
      // Un tracé réel pèse plusieurs ko ; un cadre vide ou un fichier géant sont refusés.
      if (!/^data:image\/png;base64,[A-Za-z0-9+\/=]+$/.test(png) || png.length < 1500 || png.length > 800_000) {
        return json({ erreur: 'Signature illisible' }, 400);
      }
      const nom = String(body.nom || '').replace(/[\r\n]/g, ' ').trim().slice(0, 120);
      if (nom.length < 3) return json({ erreur: 'Signature illisible' }, 400);
      if (body.lu !== true) return json({ erreur: 'Signature illisible' }, 400);

      const d = (rep.donnees || {}) as Record<string, any>;
      const lu: Record<string, unknown> = {};
      LV_CHAMPS_PUBLICS.forEach(k => { lu[k] = d[k] ?? ''; });
      const signeLe = new Date().toISOString();
      const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
      const ua = (req.headers.get('user-agent') || '').slice(0, 300) || null;
      const donnees = {
        ...d,
        _sigs: { ...(d._sigs || {}), salarie: png },
        _signature: { signe_le: signeLe, nom, via: 'lien_stagiaire', stagiaire_id: stag.id },
      };
      const { data: maj, error: ue } = await sb.from('documents_reponses').update({
        donnees,
        statut: 'signe',
        signature_empreinte: await empreinte(JSON.stringify(lu)),
        signature_ip: ip,
        signature_user_agent: ua,
        updated_at: signeLe,
      }).eq('id', rep.id).neq('statut', 'signe').select('id');
      if (ue) throw ue;
      if (!maj?.length) return json({ erreur: 'Document déjà signé' }, 409);
      return json({ ok: true, signe_le: signeLe });
    }

    return json({ erreur: 'Action inconnue' }, 400);
  } catch (e) {
    const msg = (e as Error).message || 'Erreur';
    // « Jeton introuvable » et « Lien expiré » sont attendus : stagiaire.html
    // s'en sert pour afficher le bon écran. Tout le reste reste volontairement
    // vague côté client, et détaillé côté logs.
    const attendu = /introuvable|expiré|accepté|trop lourd|illisible|inconnue|validée|signé/i.test(msg);
    if (!attendu) console.error('[dossier-stagiaire]', e);
    return json({ erreur: attendu ? msg : 'Erreur serveur' }, attendu ? 403 : 500);
  }
});
