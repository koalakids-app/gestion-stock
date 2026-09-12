// ============================================================================
// supabase/functions/envoyer-dossier-famille/index.ts
// Koala Kids — septembre 2026
//
// Envoie à la famille le mail contenant le lien vers son dossier. Appelée
// depuis demandes.html, dont le helper callFn() présente la clé anon et non le
// JWT de la référente : cette fonction se déploie donc, comme les vôtres, avec
//
//   supabase functions deploy envoyer-dossier-famille --no-verify-jwt
//
// COMME ELLE N'EST PAS PROTÉGÉE PAR UN JWT, elle ne reçoit AUCUN contenu à
// expédier : on ne lui passe qu'un identifiant de dossier. Elle relit
// elle-même en base l'adresse, l'enfant, la crèche et l'échéance, et compose
// le lien à partir de APP_URL. Autrement dit, tout ce qu'elle sait faire, c'est
// renvoyer à une famille déjà enregistrée son propre lien — connaître son URL
// ne permet ni d'écrire à une adresse arbitraire, ni de glisser un lien
// étranger dans un mail à en-tête Koala Kids.
//
// La ligne dossiers_familles, elle, est créée par l'application sous RLS, donc
// par quelqu'un qui a le droit de la créer. Cette fonction n'en crée jamais.
//
// Code de pointage kiosque : le mail embarque aussi le code à 4 chiffres de
// l'enfant (table enfants.code_pointage), généré ici s'il n'existe pas encore
// — cette fonction tourne avec la clé service_role, donc peut l'écrire sans
// dépendre d'un aller-retour préalable côté application. Un code déjà présent
// n'est jamais régénéré : une relance renvoie toujours le même code, la
// famille ne doit pas en changer entre deux mails.
//
// Envoi par SMTP Gmail plutôt que Resend : Resend exige un domaine expéditeur
// vérifié (DNS), pas encore disponible (koalakids.fr en attente d'accès DNS).
// Un compte Gmail avec validation en deux étapes + mot de passe d'application
// suffit, sans dépendance à un domaine.
//
// VARIABLES D'ENVIRONNEMENT — mêmes noms que les autres fonctions d'envoi
// d'e-mail de l'appli, aucune à créer si déjà posées :
//   GMAIL_USER           adresse Gmail d'expédition (ex. koalakids.app@gmail.com)
//   GMAIL_APP_PASSWORD   mot de passe d'application à 16 caractères, généré
//                        depuis myaccount.google.com/apppasswords
//   APP_URL              la racine de l'application ; si elle pointe sur une page
//                        précise, le dossier parent est repris automatiquement.
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

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const dfr = (d: string) => {
  try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return ''; }
};

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

async function sendEmail(to: string[], subject: string, html: string) {
  const user = Deno.env.get('GMAIL_USER');
  const pass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!user || !pass) {
    throw new Error('Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).');
  }
  // "From" doit obligatoirement être l'adresse authentifiée elle-même : Gmail
  // rejette silencieusement tout expéditeur différent du compte SMTP utilisé.
  const client = new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port: 465,
      tls: true,
      auth: { username: user, password: pass },
    },
  });
  try {
    await client.send({
      from: user,
      to,
      subject,
      content: 'Ce message nécessite un client de messagerie compatible HTML.',
      html,
    });
  } finally {
    await client.close();
  }
}

// Code à 4 chiffres, unique parmi les enfants ET le personnel (même espace de
// codes que le mode kiosque, pour ne jamais avoir d'ambiguïté sur la tablette).
async function genererCodePointageUnique(): Promise<string> {
  for (let tentative = 0; tentative < 20; tentative++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const [e, r] = await Promise.all([
      sb.from('enfants').select('id', { count: 'exact', head: true }).eq('code_pointage', code),
      sb.from('referents').select('id', { count: 'exact', head: true }).eq('code_pointage', code),
    ]);
    if (!e.count && !r.count) return code;
  }
  throw new Error('Impossible de générer un code de pointage unique après 20 tentatives');
}

function corpsHtml(o: {
  enfant: string; prenom: string; creche: string; lien: string; expire: string;
  relance: boolean; code: string | null;
}) {
  const intro = o.relance
    ? `Le dossier de familiarisation de <b>${esc(o.enfant)}</b> n'est pas encore complet.
       Voici à nouveau votre lien personnel — il ne reste que quelques minutes de saisie.`
    : `<b>${esc(o.enfant)}</b> rejoint bientôt notre micro-crèche${o.creche ? ` de <b>${esc(o.creche)}</b>` : ''}.
       Avant la période de familiarisation, nous avons besoin de quelques documents.`;

  const blocCode = o.code ? `
        <div style="margin:0 0 22px;background:#EEEDF8;border:1px solid #D8D6F0;border-radius:11px;
          padding:14px 18px;text-align:center">
          <div style="font-size:13px;color:#3D3580;font-weight:700;margin-bottom:4px">
            Code de pointage sur la tablette de la crèche
          </div>
          <div style="font-size:26px;font-weight:800;letter-spacing:5px;color:#3D3580">${esc(o.code)}</div>
          <div style="font-size:12.5px;color:#78748C;margin-top:5px">
            À saisir sur l'écran d'accueil de la tablette (mode kiosque) pour pointer l'arrivée
            et le départ de ${esc(o.prenom)}, à la dépose et à la reprise.
          </div>
        </div>` : '';

  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F6FC;padding:24px 12px;
    font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2740;line-height:1.6">
    <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;
      border:1px solid #E3E1EF">
      <div style="background:#3D3580;color:#fff;padding:22px 24px">
        <div style="font-size:20px;font-weight:700">Dossier de familiarisation</div>
        <div style="font-size:14px;opacity:.85;margin-top:3px">Koala Kids${o.creche ? ' · ' + esc(o.creche) : ''}</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 16px;font-size:15px">Bonjour,</p>
        <p style="margin:0 0 18px;font-size:15px">${intro}</p>
        <p style="margin:0 0 22px;font-size:15px">
          Tout se fait en ligne, depuis votre téléphone : vous remplissez, vous signez du doigt,
          et vous pouvez vous y reprendre en plusieurs fois. Certains documents sont seulement
          à imprimer — la fiche sanitaire, notamment, que votre médecin doit compléter et signer.
        </p>
        <p style="margin:0 0 22px;text-align:center">
          <a href="${esc(o.lien)}" style="display:inline-block;background:#F47920;color:#fff;
            text-decoration:none;font-weight:700;font-size:16px;padding:14px 30px;border-radius:11px">
            Ouvrir mon dossier
          </a>
        </p>
        <p style="margin:0 0 8px;font-size:13.5px;color:#78748C">
          Ce lien est personnel et valable jusqu'au <b>${esc(dfr(o.expire))}</b>. Passé ce délai,
          demandez-nous simplement un nouveau lien.
        </p>
        <p style="margin:0 0 18px;font-size:13.5px;color:#78748C">
          Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br>
          <span style="word-break:break-all;color:#3D3580">${esc(o.lien)}</span>
        </p>
        ${blocCode}
        <p style="margin:0;font-size:15px">À très vite,<br>L'équipe Koala Kids</p>
      </div>
    </div>
    <p style="max-width:540px;margin:14px auto 0;font-size:12px;color:#9A96AC;text-align:center">
      Message automatique — pour toute question, répondez à cet e-mail ou appelez la crèche.
    </p>
  </body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  const base = Deno.env.get('APP_URL') || '';
  if (!Deno.env.get('GMAIL_USER') || !Deno.env.get('GMAIL_APP_PASSWORD')) {
    console.error('[envoyer-dossier-famille] GMAIL_USER / GMAIL_APP_PASSWORD absente(s)');
    return json({ erreur: 'Service de mail non configuré' }, 500);
  }
  if (!base) {
    console.error('[envoyer-dossier-famille] APP_URL absente');
    return json({ erreur: 'APP_URL non configurée' }, 500);
  }

  try {
    const { dossier_id, relance } = await req.json();
    if (!dossier_id) return json({ erreur: 'Dossier manquant' }, 400);

    const { data: dossier } = await sb
      .from('dossiers_familles').select('*').eq('id', dossier_id).maybeSingle();
    if (!dossier) return json({ erreur: 'Dossier introuvable' }, 404);
    if (dossier.statut === 'annule') return json({ erreur: 'Dossier annulé' }, 409);
    if (new Date(dossier.expire_le).getTime() < Date.now()) {
      return json({ erreur: 'Dossier expiré' }, 409);
    }
    // Un dossier peut avoir plusieurs destinataires — deux parents, deux boîtes
    // mail, un seul et même lien. Ils sont stockés séparés par des virgules.
    const adresses = String(dossier.email || '')
      .split(/[,;]/).map((a: string) => a.trim()).filter(Boolean);
    if (!adresses.length) return json({ erreur: 'Aucune adresse sur ce dossier' }, 400);

    const { data: enfant } = await sb
      .from('enfants').select('prenom,nom,creche_id,code_pointage').eq('id', dossier.enfant_id).maybeSingle();
    const { data: creche } = enfant?.creche_id
      ? await sb.from('creches').select('name').eq('id', enfant.creche_id).maybeSingle()
      : { data: null };

    // Le code de pointage kiosque : réutilisé s'il existe déjà, généré sinon.
    // Une panne de génération ne doit jamais bloquer l'envoi du dossier — le
    // mail part sans le code, la référente pourra toujours le transmettre à
    // la main depuis la fiche enfant.
    let codePointage: string | null = enfant?.code_pointage || null;
    if (!codePointage && enfant) {
      try {
        codePointage = await genererCodePointageUnique();
        await sb.from('enfants').update({ code_pointage: codePointage }).eq('id', dossier.enfant_id);
      } catch (e) {
        console.error('[envoyer-dossier-famille] génération code_pointage', e);
        codePointage = null;
      }
    }

    // APP_URL peut pointer sur le dossier ou sur une page précise (index.html,
    // demandes.html…) : on retombe dans les deux cas sur le dossier parent.
    const racine = base.replace(/[^/]*\.html?(\?.*)?$/i, '').replace(/\/*$/, '/');
    const lien = racine + 'famille.html?t=' + dossier.token;
    const prenom = (enfant?.prenom || 'votre enfant').trim();

    try {
      await sendEmail(
        adresses,
        relance
          ? `Rappel — dossier de familiarisation de ${prenom}`
          : `Le dossier de familiarisation de ${prenom}`,
        corpsHtml({
          enfant: ((enfant?.prenom || '') + ' ' + (enfant?.nom || '')).trim() || 'votre enfant',
          prenom,
          creche: creche?.name || '',
          lien,
          expire: dossier.expire_le,
          relance: !!relance,
          code: codePointage,
        }),
      );
    } catch (mailErr) {
      // Le détail (identifiants Gmail refusés, quota dépassé…) part dans les
      // logs : c'est là qu'on le cherchera, pas dans le navigateur d'une
      // référente en pleine rentrée.
      console.error('[envoyer-dossier-famille] SMTP', mailErr);
      return json({ erreur: "L'e-mail n'a pas pu être envoyé" }, 502);
    }

    // Le compteur de relances n'est incrémenté qu'ici, une fois l'envoi
    // réellement accepté : compté côté application, il monterait aussi quand
    // le mail échoue.
    if (relance) {
      await sb.from('dossiers_familles').update({
        relances: (dossier.relances || 0) + 1,
        derniere_relance: new Date().toISOString(),
      }).eq('id', dossier.id);
    }

    return json({ ok: true });
  } catch (e) {
    console.error('[envoyer-dossier-famille]', e);
    return json({ erreur: 'Erreur serveur' }, 500);
  }
});
