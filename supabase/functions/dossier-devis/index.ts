// ============================================================================
// supabase/functions/dossier-devis/index.ts
// Koala Kids — septembre 2026
//
// La porte d'entrée de devis.html. C'est la SEULE façon dont une famille touche
// à la base : la page publique n'a aucun accès aux tables (voir 26, partie 5,
// qui ne crée aucune policy anon).
//
// Cette fonction s'exécute en service_role et contourne donc la RLS. Tout son
// travail consiste à ne rien laisser sortir qui ne corresponde pas au jeton
// reçu. Trois règles, dans cet ordre, avant toute lecture ou écriture :
//   1. le jeton existe ;
//   2. le devis n'est ni expiré, ni annulé, ni déjà clos ;
//   3. on ne renvoie que ce que la famille doit voir — jamais les notes
//      internes, jamais les revenus, jamais un identifiant qui ne lui sert pas.
//
// DÉPLOIEMENT — la famille n'a pas de compte, donc pas de JWT :
//   supabase functions deploy dossier-devis --no-verify-jwt
//
// Sans --no-verify-jwt, toutes les requêtes des familles reviennent en 401.
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
// Même seuil que dossier-famille, pour que les deux pages se comportent pareil.
const sigReelle = (v: unknown) =>
  typeof v === 'string' && v.startsWith('data:image') && v.length > 1500;

// Une signature démesurée n'est pas un tracé, c'est un envoi malveillant ou un
// canvas géant. 700 ko couvre très largement un trait au doigt en 600×200.
const SIG_MAX = 700_000;

const RESEAU_CFG_ID = '00000000-0000-0000-0000-000000000003';

/** Charge le devis et refuse tout ce qui n'est plus signable. */
async function devisValide(token: string) {
  if (!token || typeof token !== 'string' || token.length < 16) {
    throw new Error('Jeton introuvable');
  }
  const { data, error } = await sb
    .from('devis').select('*').eq('token', token).maybeSingle();
  if (error) throw new Error('Lecture impossible');
  if (!data) throw new Error('Jeton introuvable');
  if (data.statut === 'annule') throw new Error('Devis annulé');
  if (data.expire_le && new Date(data.expire_le).getTime() < Date.now()) {
    throw new Error('Devis expiré');
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  try {
    const body = await req.json();
    const action = String(body.action || '');
    const devis = await devisValide(String(body.token || ''));

    // ---------------------------------------------------------------- GET
    if (action === 'get') {
      const [lignes, pre, creche, etab] = await Promise.all([
        sb.from('devis_lignes').select('libelle,description,type,quantite,montant_unitaire,total,ordre')
          .eq('devis_id', devis.id).order('ordre'),
        sb.from('preinscriptions').select('prenom,nom,dob,ne_ou_a_naitre')
          .eq('id', devis.preinscription_id).maybeSingle(),
        devis.creche_id
          ? sb.from('creches').select('name,addr,org_id').eq('id', devis.creche_id).maybeSingle()
          : Promise.resolve({ data: null }),
        devis.creche_id
          ? sb.from('etablissements').select(
              'raison_sociale,forme_juridique,siret,adresse_siege,telephone,email,pmi_numero'
            ).eq('creche_id', devis.creche_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      // reseau_config est propre à chaque organisation : on le résout via
      // l'org_id de la crèche du devis, avec la ligne historique Koala Kids
      // en secours si la crèche ou l'organisation n'est pas connue.
      const reseau = creche.data?.org_id
        ? await sb.from('reseau_config').select('config').eq('org_id', creche.data.org_id).maybeSingle()
        : await sb.from('reseau_config').select('config').eq('id', RESEAU_CFG_ID).maybeSingle();

      // Branding cosmétique de la page publique (logo, nom) — n'a aucune
      // incidence sur le contenu du devis lui-même.
      const organisation = creche.data?.org_id
        ? (await sb.from('organisations').select('nom,logo_url').eq('id', creche.data.org_id).maybeSingle()).data
        : null;

      // Première ouverture : on l'horodate une seule fois. Cela permet à la
      // direction de distinguer « le mail n'est jamais arrivé » de « il a été
      // ouvert et rien n'a été signé » — deux relances très différentes.
      if (!devis.vu_le) {
        await sb.from('devis').update({ vu_le: new Date().toISOString() }).eq('id', devis.id);
      }

      const p = pre.data;
      return json({
        devis: {
          numero: devis.numero, revision: devis.revision, statut: devis.statut,
          date_debut: devis.date_debut, date_fin: devis.date_fin, jours: devis.jours,
          jours_accueil: devis.jours_accueil, mois_factures: devis.mois_factures,
          heure_debut: devis.heure_debut, heure_fin: devis.heure_fin,
          heures_hebdo: devis.heures_hebdo, semaines_an: devis.semaines_an,
          tarif_libelle: devis.tarif_libelle, tarif_mode: devis.tarif_mode,
          total_mensuel: devis.total_mensuel, total_annuel: devis.total_annuel,
          frais_uniques: devis.frais_uniques,
          cmg_estime: devis.cmg_estime, reste_a_charge: devis.reste_a_charge,
          commentaire: devis.commentaire,
          envoye_le: devis.envoye_le, expire_le: devis.expire_le,
          // `repondu_le` porte les deux réponses possibles ; la page publique,
          // elle, veut savoir laquelle. On la lui livre déjà démêlée plutôt que
          // de faire redire la règle à devis.html.
          signe_le: devis.statut === 'accepte' ? devis.repondu_le : null,
          signe_par: devis.repondu_par,
          refuse_le: devis.statut === 'refuse' ? devis.repondu_le : null,
          // JAMAIS : notes_internes, created_by, preinscription_id, token.
        },
        lignes: lignes.data || [],
        enfant: p ? {
          prenom: p.prenom, nom: p.nom, dob: p.dob, ne_ou_a_naitre: p.ne_ou_a_naitre,
        } : null,
        creche: creche.data || null,
        etablissement: etab.data || null,
        reseau: (reseau.data && reseau.data.config) || {},
        organisation,
      });
    }

    // -------------------------------------------------------------- SIGNER
    if (action === 'signer') {
      // Un devis déjà clos ne se re-signe pas. Le dire explicitement plutôt
      // que d'écraser : deux parents peuvent ouvrir le même lien.
      if (devis.repondu_le) {
        return json({ erreur: 'Ce devis a déjà reçu une réponse.' }, 409);
      }
      if (devis.statut !== 'envoye') {
        return json({ erreur: "Ce devis n'est pas en attente de signature." }, 409);
      }

      const nom = String(body.nom || '').trim();
      const sig = body.signature;
      if (nom.length < 3) return json({ erreur: 'Indiquez votre nom et votre prénom.' }, 400);
      if (nom.length > 120) return json({ erreur: 'Nom trop long.' }, 400);
      if (!sigReelle(sig)) return json({ erreur: 'Signature manquante ou trop brève.' }, 400);
      if (String(sig).length > SIG_MAX) return json({ erreur: 'Signature trop volumineuse.' }, 400);

      const maintenant = new Date().toISOString();
      // Le token N'EST PAS effacé : la contrainte devis_envoi_ck exige qu'un
      // devis hors brouillon en porte un, et l'effacer ferait échouer
      // l'acceptation au moment précis où la famille signe. C'est `repondu_le`
      // qui ferme la porte — un lien rouvert ensuite ne montre plus que l'écran
      // de confirmation.
      const { error } = await sb.from('devis').update({
        statut: 'accepte',
        repondu_le: maintenant,
        repondu_par: nom,
        signature_png: sig,
        updated_at: maintenant,
      }).eq('id', devis.id)
        // Garde-fou contre deux signatures simultanées — deux parents peuvent
        // ouvrir le même lien : la seconde ne trouve plus de ligne à modifier.
        .is('repondu_le', null);
      if (error) throw error;

      // La préinscription suit : la file d'attente doit montrer « Devis accepté »
      // sans qu'on ait à rouvrir la fiche.
      await sb.from('preinscriptions')
        .update({ statut: 'accepte' })
        .eq('id', devis.preinscription_id)
        .in('statut', ['nouvelle', 'en_contact', 'devis_envoye']);

      return json({ ok: true, signe_le: maintenant, signe_par: nom });
    }

    // ------------------------------------------------------------- REFUSER
    // Refuser est une réponse, pas un échec : sans ce bouton, une famille qui
    // décline ne fait rien, et la crèche relance dans le vide pendant un mois.
    if (action === 'refuser') {
      if (devis.repondu_le) {
        // Déjà répondu : si c'était déjà un refus, on ne proteste pas.
        if (devis.statut === 'refuse') return json({ ok: true });
        return json({ erreur: 'Ce devis a déjà été accepté.' }, 409);
      }
      const motif = String(body.motif || '').trim().slice(0, 500);
      const maintenant = new Date().toISOString();
      const { error } = await sb.from('devis').update({
        statut: 'refuse', repondu_le: maintenant, motif_refus: motif,
        updated_at: maintenant,
      }).eq('id', devis.id).is('repondu_le', null);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ erreur: 'Action inconnue' }, 400);
  } catch (e) {
    const msg = (e as Error).message || 'Erreur';
    // « Jeton introuvable », « Devis expiré » et « Devis annulé » sont attendus :
    // devis.html s'en sert pour afficher le bon écran. Tout le reste reste
    // volontairement vague côté client, et détaillé côté logs.
    const attendu = /introuvable|expiré|annulé/i.test(msg);
    if (!attendu) console.error('[dossier-devis]', e);
    return json({ erreur: attendu ? msg : 'Erreur serveur' }, attendu ? 403 : 500);
  }
});
