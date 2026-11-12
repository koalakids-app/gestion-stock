// ============================================================================
// supabase/functions/dossier-candidat/index.ts
// Koala Kids — Module Recrutement (remplacement d'un·e salarié·e)
//
// La porte d'entrée de candidat.html. C'est la SEULE façon dont un·e candidat·e
// touche à la base : la page publique n'a aucun accès aux tables ni au bucket
// `recrutement` (privé, aucune policy anon — sql/recrutement.sql).
//
// La fonction s'exécute en service_role. Avant toute lecture ou écriture :
//   1. le jeton existe ;
//   2. il n'est ni expiré, ni rattaché à une candidature refusée ou retirée ;
//   3. une pièce jointe n'est signée que si elle appartient à CETTE fiche.
//
// Le lien n'ouvre qu'une SESSION COURTE (voir _shared/session-lien.ts).
//
// Actions : get · document_url · projet_ouvert · questionnaire
//
// DÉPLOIEMENT — la personne n'a pas de compte, donc pas de JWT :
//   supabase functions deploy dossier-candidat --no-verify-jwt
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resoudreJeton } from '../_shared/session-lien.ts';
import { questionsDe, REPONSE_MAX } from '../_shared/recrutement-questions.ts';

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

const BUCKET = 'recrutement';
// Le lien de lecture d'une pièce jointe vaut 5 minutes : le transférer ne sert à rien.
const URL_TTL = 300;

async function candidatValide(token: string) {
  if (!token || typeof token !== 'string' || token.length < 16) throw new Error('Jeton introuvable');
  const { data, error } = await sb.from('recrutement_candidats').select('*').eq('token', token).maybeSingle();
  if (error) throw new Error('Lecture impossible');
  if (!data) throw new Error('Jeton introuvable');
  if (data.statut === 'refuse' || data.statut === 'desiste') throw new Error('Lien expiré');
  if (!data.token_expire_le || new Date(data.token_expire_le).getTime() < Date.now()) throw new Error('Lien expiré');
  return data;
}

/** Prévient la direction et les référent·e·s de la crèche. Ne fait jamais échouer l'action. */
async function prevenirEquipe(cand: Record<string, any>, orgId: string | null, titre: string, texte: string) {
  try {
    const filtre = orgId
      ? `creche_id.eq.${cand.creche_id},and(creche_id.is.null,org_id.eq.${orgId})`
      : `creche_id.eq.${cand.creche_id}`;
    const { data: refs } = await sb.from('referents').select('id').in('role', ['referent', 'direction']).or(filtre);
    const ids = (refs ?? []).map((r: any) => r.id);
    if (!ids.length) return;
    const url = Deno.env.get('SUPABASE_URL')!;
    const cle = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    await fetch(`${url}/functions/v1/notify-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cle}`, apikey: cle },
      body: JSON.stringify({
        referent_ids: ids,
        title: titre,
        body: texte,
        url: './demandes.html?section=recrutement',
        tag: `recrutement-${cand.id}`,
      }),
    });
  } catch (e) {
    console.error('[dossier-candidat] push', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  try {
    const body = await req.json();
    const action = String(body.action || '');
    const sess = await resoudreJeton(body, 'dossier-candidat');
    if ('reponse' in sess) return sess.reponse;
    const cand = await candidatValide(sess.token);

    const { data: creche } = await sb.from('creches').select('name, org_id').eq('id', cand.creche_id).maybeSingle();
    const orgId = creche?.org_id ?? null;

    // ---------------------------------------------------------------- GET
    if (action === 'get') {
      if (!cand.lien_ouvert_le) {
        await sb.from('recrutement_candidats').update({ lien_ouvert_le: new Date().toISOString() }).eq('id', cand.id);
      }
      const { data: envois } = await sb.from('recrutement_envois')
        .select('id,libelle,message,filename,ouvert_le,created_at')
        .eq('candidat_id', cand.id).order('created_at');
      const questions = cand.avec_questionnaire ? await questionsDe(sb, orgId) : [];
      const deja: { q: string; r: string }[] = Array.isArray(cand.reponses) ? cand.reponses : [];
      return json({
        // Uniquement ce dont la page a besoin : ni notes de la crèche, ni statut,
        // ni nom de la personne remplacée.
        candidat: {
          prenom: cand.prenom,
          creche_nom: creche?.name || '',
          poste: cand.poste || '',
          date_debut: cand.date_debut,
          date_fin: cand.date_fin,
          entretien_date: cand.entretien_date,
          entretien_heure: cand.entretien_heure,
          expire_le: cand.token_expire_le,
        },
        projet: cand.avec_projet ? { ouvert_le: cand.projet_ouvert_le } : null,
        // Jamais le chemin d'un fichier : la page demande une URL signée au clic.
        documents: envois || [],
        questionnaire: cand.avec_questionnaire
          ? {
            // Réponse déjà envoyée : on la réaffiche en face de la question d'origine.
            questions: questions.map((q) => ({ q, r: deja.find((d) => d.q === q)?.r || '' })),
            le: cand.reponses_le,
          }
          : null,
      });
    }

    // -------------------------------------------------------- DOCUMENT_URL
    if (action === 'document_url') {
      const id = String(body.document_id || '');
      const { data: e } = await sb.from('recrutement_envois')
        .select('id,candidat_id,bucket,path,filename,ouvert_le').eq('id', id).maybeSingle();
      if (!e || String(e.candidat_id) !== String(cand.id)) return json({ erreur: 'Document introuvable' }, 404);
      const { data, error } = await sb.storage.from(e.bucket || BUCKET).createSignedUrl(e.path, URL_TTL);
      if (error || !data) throw error || new Error('Signature impossible');
      if (!e.ouvert_le) {
        await sb.from('recrutement_envois').update({ ouvert_le: new Date().toISOString() }).eq('id', e.id);
      }
      return json({ url: data.signedUrl, filename: e.filename || null });
    }

    // ------------------------------------------------------- PROJET_OUVERT
    // Le projet pédagogique est une page publique : seule la première
    // consultation depuis ce lien est datée.
    if (action === 'projet_ouvert') {
      if (!cand.avec_projet) return json({ erreur: 'Document introuvable' }, 404);
      if (!cand.projet_ouvert_le) {
        await sb.from('recrutement_candidats').update({ projet_ouvert_le: new Date().toISOString() }).eq('id', cand.id);
      }
      return json({ ok: true });
    }

    // ------------------------------------------------------- QUESTIONNAIRE
    // La personne peut renvoyer ses réponses tant que le lien est valable : la
    // dernière version fait foi. Les questions viennent du serveur, jamais de la page.
    if (action === 'questionnaire') {
      if (!cand.avec_questionnaire) return json({ erreur: 'Action inconnue' }, 403);
      const questions = await questionsDe(sb, orgId);
      const recu: unknown[] = Array.isArray(body.reponses) ? body.reponses : [];
      if (recu.length !== questions.length) return json({ erreur: 'Réponse illisible' }, 400);
      const reponses = questions.map((q, i) => ({
        q,
        r: String(recu[i] ?? '').replace(/\r/g, '').trim().slice(0, REPONSE_MAX),
      }));
      if (!reponses.some((x) => x.r)) return json({ erreur: 'Réponse illisible' }, 400);
      const le = new Date().toISOString();
      const { error } = await sb.from('recrutement_candidats')
        .update({ reponses, reponses_le: le, updated_at: le }).eq('id', cand.id);
      if (error) throw error;
      await prevenirEquipe(cand, orgId, 'Recrutement : questionnaire rempli',
        `${cand.prenom || 'Un·e candidat·e'} a répondu au questionnaire sur le projet.`);
      return json({ ok: true, le });
    }

    return json({ erreur: 'Action inconnue' }, 400);
  } catch (e) {
    const msg = (e as Error).message || 'Erreur';
    const attendu = /introuvable|expiré|illisible|inconnue/i.test(msg);
    if (!attendu) console.error('[dossier-candidat]', e);
    return json({ erreur: attendu ? msg : 'Erreur serveur' }, attendu ? 403 : 500);
  }
});
