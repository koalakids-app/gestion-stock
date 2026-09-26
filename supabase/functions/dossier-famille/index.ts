// ============================================================================
// supabase/functions/dossier-famille/index.ts
// Koala Kids — septembre 2026
//
// La porte d'entrée de famille.html. C'est la SEULE façon dont une famille
// touche à la base : la page publique n'a aucun accès aux tables (voir
// 15c-dossiers-policies.sql, qui ne crée aucune policy anon).
//
// Cette fonction s'exécute en service_role et contourne donc la RLS. Tout son
// travail consiste à ne rien laisser sortir qui ne corresponde pas au jeton
// reçu. Trois règles, dans cet ordre, avant toute lecture ou écriture :
//   1. le jeton existe ;
//   2. le dossier n'est ni expiré ni annulé ;
//   3. le document demandé appartient bien au pack ET à la crèche de l'enfant.
//
// DÉPLOIEMENT — la famille n'a pas de compte, donc pas de JWT :
//   supabase functions deploy dossier-famille --no-verify-jwt
//
// Sans --no-verify-jwt, toutes les requêtes des familles seront rejetées en 401.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

// Un tracé réel pèse plusieurs milliers de caractères ; un cadre effleuré,
// quelques centaines. Le contrôle est refait ici : le client peut mentir.
const sigReelle = (v: unknown) =>
  typeof v === 'string' && v.startsWith('data:image') && v.length > 1500;

// creches.name porte la raison sociale complète ("Koalakids Toulon Brunet") ;
// famille.html affiche/propose depuis toujours le libellé court ("Brunet").
// Même dérivation que shortCrecheName() côté front (stock.html, documents.html,
// ludotheque.html, demandes.html) — à faire évoluer ensemble si l'un change.
function nomCourt(nom: string | null | undefined): string {
  return String(nom || '').replace(/^Koalakids\s+/i, '').replace(/^Toulon\s+/i, '').trim() || (nom || '');
}

/** Charge le dossier et refuse tout ce qui n'est plus valable. */
async function dossierValide(token: string) {
  if (!token || typeof token !== 'string' || token.length < 16) {
    throw new Error('Jeton introuvable');
  }
  const { data, error } = await sb
    .from('dossiers_familles')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (error) throw new Error('Lecture impossible');
  if (!data) throw new Error('Jeton introuvable');
  if (data.statut === 'annule') throw new Error('Dossier expiré');
  if (new Date(data.expire_le).getTime() < Date.now()) throw new Error('Dossier expiré');
  return data;
}

/** Les documents du pack visibles pour cet enfant. */
async function packDeLEnfant(crecheId: string | null) {
  const { data } = await sb
    .from('documents_koala')
    .select('id,titre,description,type,template_key,schema_champs,fichier_url,pack_ordre,pack_imprimer,creche_id')
    .eq('actif', true)
    .eq('pack_familiarisation', true)
    .order('pack_ordre')
    .order('titre');
  // Un document rattaché à une crèche ne part qu'aux familles de cette crèche.
  // Les documents sans crèche valent pour tout le réseau.
  return (data || []).filter(d => !d.creche_id || String(d.creche_id) === String(crecheId));
}

/** Le dossier passe à « complet » quand tout ce qui se remplit en ligne est signé. */
async function majStatut(dossier: any, pack: any[]) {
  const attendus = pack.filter(d => d.type === 'remplissable' && !d.pack_imprimer);
  const { data: reps } = await sb
    .from('documents_reponses')
    .select('document_id,statut')
    .eq('dossier_id', dossier.id);
  const signes = new Set((reps || []).filter(r => r.statut === 'signe').map(r => r.document_id));
  const complet = attendus.length > 0 && attendus.every(d => signes.has(d.id));
  const statut = complet ? 'complet' : ((reps || []).length ? 'en_cours' : 'envoye');
  if (statut !== dossier.statut) {
    await sb.from('dossiers_familles')
      .update({ statut, complete_le: complet ? new Date().toISOString() : null })
      .eq('id', dossier.id);
  }
  return statut;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  try {
    const body = await req.json();
    const action = String(body.action || '');
    const dossier = await dossierValide(String(body.token || ''));

    const { data: enfant } = await sb
      .from('enfants')
      .select('id,prenom,nom,dob,creche_id')
      .eq('id', dossier.enfant_id)
      .maybeSingle();
    if (!enfant) return json({ erreur: 'Dossier introuvable' }, 404);

    const { data: creche } = await sb
      .from('creches').select('name,org_id').eq('id', enfant.creche_id).maybeSingle();

    const pack = await packDeLEnfant(enfant.creche_id);

    // ---------------------------------------------------------------- GET
    if (action === 'get') {
      const { data: reps } = await sb
        .from('documents_reponses')
        .select('id,document_id,statut,donnees,updated_at')
        .eq('dossier_id', dossier.id);
      const parDoc = new Map((reps || []).map(r => [r.document_id, r]));

      // Liste des crèches de l'organisation (pour les selects "Crèche" des
      // formulaires du pack, ex. remise de médicament, autorisation photo) —
      // toujours celles de l'organisation de l'enfant, jamais d'une autre.
      let creches: string[] = [];
      if (creche?.org_id) {
        const { data: rows } = await sb
          .from('creches').select('name').eq('org_id', creche.org_id).order('name');
        creches = (rows || []).map(r => nomCourt(r.name));
      }

      return json({
        dossier: { expire_le: dossier.expire_le, statut: dossier.statut },
        enfant: {
          prenom: enfant.prenom, nom: enfant.nom, dob: enfant.dob,
          creche_nom: nomCourt(creche?.name) || '',
        },
        creches,
        // On ne renvoie que ce dont la page a besoin : ni creche_id, ni
        // identifiants internes autres que ceux des documents.
        documents: pack.map(d => ({
          id: d.id, titre: d.titre, description: d.description, type: d.type,
          template_key: d.template_key, schema_champs: d.schema_champs,
          fichier_url: d.fichier_url, pack_imprimer: d.pack_imprimer,
          reponse: parDoc.get(d.id) || null,
        })),
      });
    }

    // --------------------------------------------------------------- SAVE
    if (action === 'save') {
      const docId = String(body.document_id || '');
      const doc = pack.find(d => d.id === docId);
      // Règle 3 : un document hors pack, ou d'une autre crèche, n'existe pas
      // pour cette famille — même si elle en connaît l'identifiant.
      if (!doc) return json({ erreur: 'Document introuvable' }, 404);
      if (doc.type !== 'remplissable' || doc.pack_imprimer) {
        return json({ erreur: 'Ce document ne se remplit pas en ligne' }, 400);
      }

      const donnees = (body.donnees && typeof body.donnees === 'object') ? body.donnees : {};
      const sigs = (donnees._sigs && typeof donnees._sigs === 'object') ? donnees._sigs : {};
      const aSigne = Object.values(sigs).some(sigReelle);
      const signer = !!body.signer;
      if (signer && !aSigne) return json({ erreur: 'Signature manquante' }, 400);

      const { data: existante } = await sb
        .from('documents_reponses')
        .select('id,statut')
        .eq('dossier_id', dossier.id)
        .eq('document_id', doc.id)
        .maybeSingle();

      // Modifiable tant que non signé : une fois signé, c'est la version qui
      // fait foi. Seule la crèche peut rouvrir un document.
      if (existante && existante.statut === 'signe') {
        return json({ erreur: 'Document verrouillé (déjà signé)' }, 409);
      }

      const row = {
        document_id: doc.id,
        enfant_id: enfant.id,
        creche_id: enfant.creche_id,
        dossier_id: dossier.id,
        donnees,
        statut: signer ? 'signe' : 'prepare',
        rempli_par_nom: 'Famille',
        updated_at: new Date().toISOString(),
      };

      let reponse;
      if (existante) {
        const { data, error } = await sb.from('documents_reponses')
          .update(row).eq('id', existante.id).select().maybeSingle();
        if (error) throw error;
        reponse = data;
      } else {
        const { data, error } = await sb.from('documents_reponses')
          .insert(row).select().maybeSingle();
        if (error) throw error;
        reponse = data;
      }

      const statut = await majStatut(dossier, pack);
      return json({ reponse, statut_dossier: statut });
    }

    return json({ erreur: 'Action inconnue' }, 400);
  } catch (e) {
    const msg = (e as Error).message || 'Erreur';
    // Les messages « Jeton introuvable » et « Dossier expiré » sont attendus :
    // famille.html s'en sert pour afficher le bon écran. Tout le reste reste
    // volontairement vague côté client, et détaillé côté logs.
    const attendu = /introuvable|expiré/i.test(msg);
    if (!attendu) console.error('[dossier-famille]', e);
    return json({ erreur: attendu ? msg : 'Erreur serveur' }, attendu ? 403 : 500);
  }
});
