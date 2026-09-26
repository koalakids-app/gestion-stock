// ============================================================================
// supabase/functions/dossier-contrat/index.ts
// Koala Kids — septembre 2026
//
// La porte d'entrée de signature-contrat.html. C'est la SEULE façon dont une famille
// touche à la base : la page publique n'a aucun accès aux tables (le script 31
// ne crée aucune policy anon sur `contrats`).
//
// Décalquée de dossier-devis, dont elle reprend les trois règles avant toute
// lecture ou écriture :
//   1. le jeton existe ;
//   2. le contrat n'est ni expiré, ni annulé, ni déjà clos ;
//   3. on ne renvoie que ce que la famille doit voir — jamais les notes
//      internes, jamais les revenus, jamais un identifiant qui ne lui sert pas.
//
// CE QUI DIFFÈRE DU DEVIS, et pourquoi :
//
//   • La signature de la famille pose le statut `signe`, PAS `accepte`. Un
//     contrat signé d'un seul côté n'engage qu'un seul côté : il attend la
//     contresignature de la crèche pour être complet. C'est cette
//     contresignature qui, ensuite, ouvre la création de la fiche enfant.
//
//   • Le sujet du contrat peut être une DEMANDE (avant la bascule) ou un
//     ENFANT (renouvellements, avenants). Le nom affiché à la famille est donc
//     cherché des deux côtés.
//
//   • Les clauses — préavis, conditions de résiliation, mentions — sont lues
//     sur le CONTRAT et non sur reseau_config : elles y ont été recopiées à
//     l'envoi. Un contrat garde les conditions sous lesquelles il a été signé,
//     même si le réseau change son texte le lendemain.
//
// RENFORCEMENT DE LA SIGNATURE FAMILLE (voir sql/contrats_signature_renforcee.sql) :
// la signature reste une signature électronique SIMPLE au sens eIDAS (pas de
// prestataire de confiance qualifié), mais trois choses réduisent le risque
// de répudiation :
//
//   1. Un code à 6 chiffres, envoyé par e-mail à l'adresse du contrat et
//      valable 10 minutes, doit être saisi en plus du nom et du tracé — le
//      lien seul ne suffit plus à signer, il faut aussi contrôler la boîte
//      mail AU MOMENT de signer. Actions `demander_code` puis `signer`.
//   2. Le contenu exact montré à la famille (montants, dates, clauses,
//      lignes) est scellé par une empreinte SHA-256 au moment de la
//      signature, dans `contrats.signature_empreinte`.
//   3. Chaque étape est journalisée avec IP et user-agent dans
//      `contrats_preuves`, table d'ajout seul que même la direction ne peut
//      pas modifier depuis l'application.
//
// DÉPLOIEMENT — la famille n'a pas de compte, donc pas de JWT :
//   supabase functions deploy dossier-contrat --no-verify-jwt
//
// Depuis le tableau de bord : *Verify JWT* DÉSACTIVÉ.
// Sans cela, toutes les requêtes des familles reviennent en 401.
//
// Secrets nécessaires (les mêmes que envoyer-contrat, pour l'envoi du code) :
//   GMAIL_USER, GMAIL_APP_PASSWORD
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

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
// Même seuil que dossier-devis, pour que les deux pages se comportent pareil.
const sigReelle = (v: unknown) =>
  typeof v === 'string' && v.startsWith('data:image') && v.length > 1500;

// Une signature démesurée n'est pas un tracé, c'est un envoi malveillant ou un
// canvas géant. 700 ko couvre très largement un trait au doigt en 600×200.
const SIG_MAX = 700_000;

const RESEAU_CFG_ID = '00000000-0000-0000-0000-000000000003';

// ---------------------------------------------------------------------------
// Preuve : IP, user-agent, empreinte du contenu signé, journal d'événements.
// ---------------------------------------------------------------------------

/** IP du visiteur telle que vue par la plateforme d'edge functions. */
function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') || 'inconnue';
}

async function sha256Hex(texte: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Code à 6 chiffres, tiré d'un générateur cryptographique. */
function genererCode(): string {
  const octet = new Uint32Array(1);
  crypto.getRandomValues(octet);
  return String(100000 + (octet[0] % 900000));
}

/** Un événement journalisé n'est jamais réécrit — voir contrats_preuves.
 *  Une panne de journalisation ne doit pas bloquer la famille : elle est
 *  seulement tracée dans les logs. */
async function journaliser(
  contratId: string, evenement: string, req: Request, detail?: Record<string, unknown>,
) {
  try {
    await sb.from('contrats_preuves').insert({
      contrat_id: contratId,
      evenement,
      ip: clientIp(req),
      user_agent: req.headers.get('user-agent') || 'inconnu',
      detail: detail || null,
    });
  } catch (e) {
    console.error('[dossier-contrat] journalisation', evenement, e);
  }
}

/** Charge le contrat et refuse tout ce qui n'est plus signable. */
async function contratValide(token: string) {
  if (!token || typeof token !== 'string' || token.length < 16) {
    throw new Error('Jeton introuvable');
  }
  const { data, error } = await sb
    .from('contrats').select('*').eq('token', token).maybeSingle();
  if (error) throw new Error('Lecture impossible');
  if (!data) throw new Error('Jeton introuvable');
  if (data.statut === 'annule') throw new Error('Contrat annulé');
  if (data.expire_le && new Date(data.expire_le).getTime() < Date.now()) {
    throw new Error('Contrat expiré');
  }
  return data;
}

/** Le nom de l'enfant, où qu'il se trouve dans le parcours.
 *  Avant la bascule il n'existe que sur la demande ; après, sur la fiche
 *  enfant. On regarde l'enfant d'abord : c'est la source la plus à jour. */
async function sujetDuContrat(c: Record<string, unknown>) {
  if (c.enfant_id) {
    const { data } = await sb.from('enfants')
      .select('prenom,nom,dob').eq('id', c.enfant_id).maybeSingle();
    if (data) return { prenom: data.prenom, nom: data.nom, dob: data.dob, ne_ou_a_naitre: 'ne' };
  }
  if (c.preinscription_id) {
    const { data } = await sb.from('preinscriptions')
      .select('prenom,nom,dob,ne_ou_a_naitre').eq('id', c.preinscription_id).maybeSingle();
    if (data) return data;
  }
  return null;
}

/** Tout ce que la famille voit — et donc tout ce qui doit être scellé par
 *  l'empreinte au moment de la signature. `get` et `signer` appellent la
 *  MÊME fonction : l'empreinte doit porter exactement ce qui a été affiché,
 *  jamais un recalcul séparé qui pourrait diverger. */
async function vueFamille(contrat: Record<string, unknown>) {
  const [lignes, sujet, creche, etab] = await Promise.all([
    sb.from('contrats_lignes')
      .select('libelle,description,type,quantite,montant_unitaire,total,ordre')
      .eq('contrat_id', contrat.id).order('ordre'),
    sujetDuContrat(contrat),
    contrat.creche_id
      ? sb.from('creches').select('name,addr,org_id').eq('id', contrat.creche_id).maybeSingle()
      : Promise.resolve({ data: null }),
    contrat.creche_id
      ? sb.from('etablissements').select(
          'raison_sociale,forme_juridique,siret,adresse_siege,telephone,email,' +
          'pmi_numero,representant_nom,representant_qualite'
        ).eq('creche_id', contrat.creche_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // reseau_config est propre à chaque organisation : on le résout via l'org_id
  // de la crèche du contrat, avec la ligne historique Koala Kids en secours.
  const reseau = creche.data?.org_id
    ? await sb.from('reseau_config').select('config').eq('org_id', creche.data.org_id).maybeSingle()
    : await sb.from('reseau_config').select('config').eq('id', RESEAU_CFG_ID).maybeSingle();

  // Les clauses figées du contrat priment ; reseau_config ne sert que de
  // filet pour un contrat créé avant qu'elles ne soient recopiées.
  const rz = (reseau.data && reseau.data.config) || {};
  const clause = (fige: unknown, secours: unknown) =>
    (typeof fige === 'string' && fige.trim()) ? fige : (secours || '');

  const contratOut = {
    numero: contrat.numero, type: contrat.type, revision: contrat.revision,
    statut: contrat.statut,
    date_debut: contrat.date_debut, date_fin: contrat.date_fin,
    date_effet: contrat.date_effet,
    jours: contrat.jours,
    jours_accueil: contrat.jours_accueil, mois_factures: contrat.mois_factures,
    heure_debut: contrat.heure_debut, heure_fin: contrat.heure_fin,
    heures_hebdo: contrat.heures_hebdo, semaines_an: contrat.semaines_an,
    repas: contrat.repas,
    tarif_libelle: contrat.tarif_libelle, tarif_mode: contrat.tarif_mode,
    total_mensuel: contrat.total_mensuel, total_annuel: contrat.total_annuel,
    frais_uniques: contrat.frais_uniques,
    cmg_estime: contrat.cmg_estime, reste_a_charge: contrat.reste_a_charge,
    famille_adresse: contrat.famille_adresse,
    famille_code_postal: contrat.famille_code_postal,
    famille_ville: contrat.famille_ville,
    commentaire: contrat.commentaire,
    envoye_le: contrat.envoye_le, expire_le: contrat.expire_le,
    // Les clauses telles qu'elles s'appliqueront à CE contrat.
    preavis_texte: clause(contrat.preavis_texte, rz.preavis_resiliation),
    conditions_resiliation: clause(contrat.conditions_resiliation, rz.conditions_resiliation),
    mentions_legales: clause(contrat.mentions_legales, rz.contrat_mentions),
    // `repondu_le` porte les deux réponses possibles ; la page publique,
    // elle, veut savoir laquelle. On la lui livre déjà démêlée plutôt que
    // de faire redire la règle à signature-contrat.html.
    signe_le: ['signe', 'contresigne'].includes(String(contrat.statut))
      ? contrat.repondu_le : null,
    signe_par: contrat.repondu_par,
    refuse_le: contrat.statut === 'refuse' ? contrat.repondu_le : null,
    // La contresignature intéresse la famille : c'est ce qui lui dit que
    // son contrat est complet des deux côtés.
    contresigne_le: contrat.contresigne_le,
    contresigne_par: contrat.contresigne_par,
    // JAMAIS : notes_internes, created_by, enfant_id, preinscription_id,
    //          devis_id, num_allocataire, token, signature_png.
  };

  return {
    contratOut, lignes: lignes.data || [],
    sujet, creche: creche.data || null, etablissement: etab.data || null,
  };
}

/** Empreinte du contenu exact présenté à la famille — clauses, montants,
 *  lignes — au moment de la signature. L'ordre des clés est fixe (littéral
 *  ci-dessus et dans vueFamille) : deux appels sur le même contrat donnent
 *  toujours la même empreinte tant que rien n'a changé. */
async function empreinteContenu(
  contratOut: Record<string, unknown>, lignes: unknown[], sujet: unknown, creche: unknown,
): Promise<string> {
  return sha256Hex(JSON.stringify({ contratOut, lignes, sujet, creche }));
}

async function sendEmail(to: string[], subject: string, html: string) {
  const user = Deno.env.get('GMAIL_USER');
  const pass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!user || !pass) {
    throw new Error('Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).');
  }
  const client = new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port: 465,
      tls: true,
      auth: { username: user, password: pass },
    },
  });
  try {
    await client.send({ from: user, to, subject, content: 'Ce message nécessite un client de messagerie compatible HTML.', html });
  } finally {
    await client.close();
  }
}

function emailCodeHtml(code: string, enseigne: string) {
  return `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#FDF8F2;font-family:Helvetica,Arial,sans-serif;color:#2B2740">
<div style="max-width:480px;margin:0 auto;padding:24px 18px">
  <div style="background:#fff;border:2px solid #EFE9F5;border-radius:16px;padding:24px 20px;text-align:center">
    <div style="font-size:14px;color:#8E8AA8;margin-bottom:6px">${enseigne} — code de vérification</div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:34px;font-weight:800;letter-spacing:6px;color:#4A3F9F;margin:10px 0">${code}</div>
    <p style="margin:10px 0 0;font-size:13.5px;color:#8E8AA8;line-height:1.6">
      Saisissez ce code sur la page de signature de votre contrat pour confirmer votre identité.
      Il est valable 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.
    </p>
  </div>
</div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  try {
    const body = await req.json();
    const action = String(body.action || '');
    const contrat = await contratValide(String(body.token || ''));

    // ---------------------------------------------------------------- GET
    if (action === 'get') {
      const { contratOut, lignes, sujet, creche, etablissement } = await vueFamille(contrat);

      // Première ouverture : on l'horodate une seule fois, et on journalise
      // l'événement à ce même moment seulement — pas à chaque rechargement de
      // page, sous peine de noyer le journal.
      if (!contrat.vu_le) {
        await sb.from('contrats').update({ vu_le: new Date().toISOString() })
          .eq('id', contrat.id);
        await journaliser(contrat.id, 'ouverture', req);
      }

      return json({ contrat: contratOut, lignes, enfant: sujet, creche, etablissement });
    }

    // --------------------------------------------------------- DEMANDER_CODE
    // Envoie le code de vérification à l'adresse du contrat. Doit précéder
    // `signer` : sans code valide en base, la signature est refusée.
    if (action === 'demander_code') {
      if (contrat.repondu_le) {
        return json({ erreur: 'Ce contrat a déjà reçu une réponse.' }, 409);
      }
      if (contrat.statut !== 'envoye') {
        return json({ erreur: "Ce contrat n'est pas en attente de signature." }, 409);
      }
      // Anti-rafale : un envoi toutes les 45 secondes au plus, et 5 envois au
      // total pour ce contrat — au-delà, quelque chose d'anormal se passe et
      // la famille doit nous appeler plutôt que continuer d'insister.
      if (contrat.otp_dernier_envoi &&
          Date.now() - new Date(contrat.otp_dernier_envoi as string).getTime() < 45_000) {
        return json({ erreur: 'Merci de patienter avant de redemander un code.' }, 429);
      }
      if ((Number(contrat.otp_envois) || 0) >= 5) {
        return json({ erreur: 'Trop de demandes de code pour ce contrat. Contactez-nous.' }, 429);
      }

      const adresses = String(contrat.destinataires || '')
        .split(',').map((x) => x.trim()).filter((x) => x.includes('@'));
      if (!adresses.length) {
        return json({ erreur: "Aucune adresse e-mail n'est enregistrée sur ce contrat. Contactez-nous." }, 400);
      }

      const code = genererCode();
      const maintenant = new Date();
      const hash = await sha256Hex(code + ':' + String(contrat.token));

      const { error } = await sb.from('contrats').update({
        otp_code_hash: hash,
        otp_expire_le: new Date(maintenant.getTime() + 10 * 60_000).toISOString(),
        otp_tentatives: 0,
        otp_envois: (Number(contrat.otp_envois) || 0) + 1,
        otp_dernier_envoi: maintenant.toISOString(),
        updated_at: maintenant.toISOString(),
      }).eq('id', contrat.id).is('repondu_le', null);
      if (error) throw error;

      let enseigne = 'Koala Kids';
      if (contrat.creche_id) {
        const { data: et } = await sb.from('etablissements')
          .select('raison_sociale').eq('creche_id', contrat.creche_id).maybeSingle();
        enseigne = (et && et.raison_sociale) || enseigne;
      }

      try {
        await sendEmail(adresses, `Votre code de vérification — ${enseigne}`, emailCodeHtml(code, enseigne));
      } catch (mailErr) {
        console.error('[dossier-contrat] envoi code', mailErr);
        return json({ erreur: "Le code n'a pas pu être envoyé. Réessayez dans un instant." }, 502);
      }

      await journaliser(contrat.id, 'code_envoye', req);
      return json({ ok: true, expire_dans: 600 });
    }

    // -------------------------------------------------------------- SIGNER
    if (action === 'signer') {
      // Un contrat déjà clos ne se re-signe pas. Le dire explicitement plutôt
      // que d'écraser : deux parents peuvent ouvrir le même lien.
      if (contrat.repondu_le) {
        return json({ erreur: 'Ce contrat a déjà reçu une réponse.' }, 409);
      }
      if (contrat.statut !== 'envoye') {
        return json({ erreur: "Ce contrat n'est pas en attente de signature." }, 409);
      }

      const nom = String(body.nom || '').trim();
      const sig = body.signature;
      const code = String(body.code || '').trim();
      if (nom.length < 3) return json({ erreur: 'Indiquez votre nom et votre prénom.' }, 400);
      if (nom.length > 120) return json({ erreur: 'Nom trop long.' }, 400);
      if (!sigReelle(sig)) return json({ erreur: 'Signature manquante ou trop brève.' }, 400);
      if (String(sig).length > SIG_MAX) return json({ erreur: 'Signature trop volumineuse.' }, 400);

      // Le code de vérification : sans lui, ni le nom ni le tracé ne suffisent
      // — c'est lui qui prouve le contrôle de la boîte mail au moment de
      // signer, pas seulement la connaissance du lien.
      if (!/^\d{6}$/.test(code)) {
        return json({ erreur: 'Saisissez le code à 6 chiffres reçu par e-mail.' }, 400);
      }
      if (!contrat.otp_code_hash || !contrat.otp_expire_le) {
        return json({ erreur: "Demandez d'abord votre code de vérification." }, 409);
      }
      if (new Date(contrat.otp_expire_le as string).getTime() < Date.now()) {
        return json({ erreur: 'Ce code a expiré. Demandez-en un nouveau.' }, 409);
      }
      if ((Number(contrat.otp_tentatives) || 0) >= 5) {
        return json({ erreur: 'Trop d\'essais. Demandez un nouveau code.' }, 429);
      }

      const hashRecu = await sha256Hex(code + ':' + String(contrat.token));
      if (hashRecu !== contrat.otp_code_hash) {
        await sb.from('contrats').update({
          otp_tentatives: (Number(contrat.otp_tentatives) || 0) + 1,
        }).eq('id', contrat.id).is('repondu_le', null);
        await journaliser(contrat.id, 'code_echec', req);
        return json({ erreur: 'Code incorrect.' }, 400);
      }
      await journaliser(contrat.id, 'code_verifie', req);

      // Le contenu exact montré à la famille est scellé maintenant, avant
      // l'écriture de la signature — c'est ce contenu-là qui est signé, pas
      // un recalcul postérieur qui pourrait déjà avoir changé.
      const { contratOut, lignes, sujet, creche } = await vueFamille(contrat);
      const empreinte = await empreinteContenu(contratOut, lignes, sujet, creche);

      const maintenant = new Date().toISOString();
      // Le token N'EST PAS effacé : la contrainte contrats_envoi_ck exige qu'un
      // contrat hors brouillon en porte un, et l'effacer ferait échouer la
      // signature au moment précis où la famille signe. C'est `repondu_le` qui
      // ferme la porte — un lien rouvert ensuite ne montre plus que l'écran de
      // confirmation.
      //
      // Le statut devient `signe` et non `accepte` : la crèche doit encore
      // contresigner. contrats_signature_ck accepte signe / contresigne /
      // resilie, précisément pour que le contrat puisse continuer à vivre
      // après ce point sans buter sur sa propre contrainte de signature.
      const { error } = await sb.from('contrats').update({
        statut: 'signe',
        repondu_le: maintenant,
        repondu_par: nom,
        signature_png: sig,
        signature_empreinte: empreinte,
        signature_ip: clientIp(req),
        signature_user_agent: req.headers.get('user-agent') || 'inconnu',
        otp_verifie_le: maintenant,
        otp_code_hash: null,
        otp_expire_le: null,
        updated_at: maintenant,
      }).eq('id', contrat.id)
        // Garde-fou contre deux signatures simultanées — deux parents peuvent
        // ouvrir le même lien : la seconde ne trouve plus de ligne à modifier.
        .is('repondu_le', null);
      if (error) throw error;

      await journaliser(contrat.id, 'signature', req, { empreinte });

      return json({ ok: true, signe_le: maintenant, signe_par: nom });
    }

    // ------------------------------------------------------------- REFUSER
    // Refuser est une réponse, pas un échec : sans ce bouton, une famille qui
    // se ravise ne fait rien, et la crèche relance dans le vide pendant un mois.
    if (action === 'refuser') {
      if (contrat.repondu_le) {
        // Déjà répondu : si c'était déjà un refus, on ne proteste pas.
        if (contrat.statut === 'refuse') return json({ ok: true });
        return json({ erreur: 'Ce contrat a déjà été signé.' }, 409);
      }
      const motif = String(body.motif || '').trim().slice(0, 500);
      const maintenant = new Date().toISOString();
      const { error } = await sb.from('contrats').update({
        statut: 'refuse', repondu_le: maintenant, motif_refus: motif,
        updated_at: maintenant,
      }).eq('id', contrat.id).is('repondu_le', null);
      if (error) throw error;
      await journaliser(contrat.id, 'refus', req, motif ? { motif } : undefined);
      return json({ ok: true });
    }

    return json({ erreur: 'Action inconnue' }, 400);
  } catch (e) {
    const msg = (e as Error).message || 'Erreur';
    // « Jeton introuvable », « Contrat expiré » et « Contrat annulé » sont
    // attendus : signature-contrat.html s'en sert pour afficher le bon écran. Tout le
    // reste reste volontairement vague côté client, et détaillé côté logs.
    const attendu = /introuvable|expiré|annulé/i.test(msg);
    if (!attendu) console.error('[dossier-contrat]', e);
    return json({ erreur: attendu ? msg : 'Erreur serveur' }, attendu ? 403 : 500);
  }
});
