// ============================================================================
// supabase/functions/envoyer-devis/index.ts
// Koala Kids — septembre 2026
//
// Envoie à la famille le mail contenant le lien vers son devis. Appelée depuis
// inscriptions.html, qui présente la clé anon et non le JWT de la direction :
// cette fonction se déploie donc, comme les autres, avec
//
//   supabase functions deploy envoyer-devis --no-verify-jwt
//
// COMME ELLE N'EST PAS PROTÉGÉE PAR UN JWT, elle ne reçoit AUCUN contenu à
// expédier : on ne lui passe qu'un identifiant de devis. Elle relit elle-même
// en base l'adresse, l'enfant, la crèche et l'échéance, et compose le lien à
// partir de APP_URL. Tout ce qu'elle sait faire, c'est renvoyer à une famille
// déjà enregistrée son propre lien — connaître son URL ne permet ni d'écrire à
// une adresse arbitraire, ni de glisser un lien étranger dans un mail à
// en-tête Koala Kids.
//
// Le jeton, lui, est posé par l'application sous RLS, donc par quelqu'un qui a
// le droit de le poser. Cette fonction n'en crée jamais.
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
//   APP_URL              la racine de l'application
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

// Même règle que le PDF : pas de toLocaleString, dont l'espace insécable
// étroite passe mal dans les clients mail anciens.
const eur = (n: unknown) => {
  const v = Math.round(Number(n || 0) * 100) / 100;
  const [ent, dec] = Math.abs(v).toFixed(2).replace('.', ',').split(',');
  return (v < 0 ? '- ' : '') + ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + dec + ' €';
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

function corpsHtml(o: {
  enfant: string; creche: string; lien: string; expire: string;
  mensuel: string; reste: string | null; relance: boolean;
}) {
  const intro = o.relance
    ? `Nous n'avons pas encore reçu votre réponse au devis d'accueil de
       <b>${esc(o.enfant)}</b>. Voici à nouveau votre lien personnel.`
    : `Voici le devis d'accueil de <b>${esc(o.enfant)}</b>${o.creche ? ` à notre micro-crèche de <b>${esc(o.creche)}</b>` : ''}.`;

  // Le reste à charge, quand il est estimé, est ce que la famille cherche en
  // premier. Le montre-t-on dans le mail ? Oui — mais toujours accompagné de
  // la mensualité brute et du mot « estimation », faute de quoi le chiffre
  // devient une promesse.
  const chiffres = o.reste
    ? `<tr><td style="padding:4px 0;font-size:15px">Mensualité</td>
         <td style="padding:4px 0;font-size:15px;text-align:right;font-weight:700">${esc(o.mensuel)}</td></tr>
       <tr><td style="padding:4px 0;font-size:15px">Reste à charge estimé, CMG déduit</td>
         <td style="padding:4px 0;font-size:15px;text-align:right;font-weight:700;color:#2E9E6B">${esc(o.reste)}</td></tr>`
    : `<tr><td style="padding:4px 0;font-size:15px">Mensualité</td>
         <td style="padding:4px 0;font-size:15px;text-align:right;font-weight:700">${esc(o.mensuel)}</td></tr>`;

  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F6FC;padding:24px 12px;
    font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2740;line-height:1.6">
    <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;
      border:1px solid #E3E1EF">
      <div style="background:#3D3580;color:#fff;padding:22px 24px">
        <div style="font-size:20px;font-weight:700">Votre devis d'accueil</div>
        <div style="font-size:14px;opacity:.85;margin-top:3px">Koala Kids${o.creche ? ' · ' + esc(o.creche) : ''}</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 16px;font-size:15px">Bonjour,</p>
        <p style="margin:0 0 18px;font-size:15px">${intro}</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 20px;
          border-top:1px solid #E3E1EF;border-bottom:1px solid #E3E1EF;padding:8px 0">
          ${chiffres}
        </table>
        <p style="margin:0 0 22px;font-size:15px">
          Le détail complet vous attend en ligne. Si le devis vous convient, vous pouvez
          l'accepter et le signer directement depuis votre téléphone — rien à imprimer,
          rien à renvoyer.
        </p>
        <p style="margin:0 0 22px;text-align:center">
          <a href="${esc(o.lien)}" style="display:inline-block;background:#F47920;color:#fff;
            text-decoration:none;font-weight:700;font-size:16px;padding:14px 30px;border-radius:11px">
            Voir et signer mon devis
          </a>
        </p>
        <p style="margin:0 0 8px;font-size:13.5px;color:#78748C">
          Ce lien est personnel et valable jusqu'au <b>${esc(dfr(o.expire))}</b>. Passé ce délai,
          demandez-nous simplement un nouveau devis.
        </p>
        <p style="margin:0 0 18px;font-size:13.5px;color:#78748C">
          Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br>
          <span style="word-break:break-all;color:#3D3580">${esc(o.lien)}</span>
        </p>
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
    console.error('[envoyer-devis] GMAIL_USER / GMAIL_APP_PASSWORD absente(s)');
    return json({ erreur: 'Service de mail non configuré' }, 500);
  }
  if (!base) {
    console.error('[envoyer-devis] APP_URL absente');
    return json({ erreur: 'APP_URL non configurée' }, 500);
  }

  try {
    const { devis_id, relance } = await req.json();
    if (!devis_id) return json({ erreur: 'Devis manquant' }, 400);

    const { data: devis } = await sb
      .from('devis').select('*').eq('id', devis_id).maybeSingle();
    if (!devis) return json({ erreur: 'Devis introuvable' }, 404);
    if (devis.statut === 'annule') return json({ erreur: 'Devis annulé' }, 409);
    if (devis.repondu_le) return json({ erreur: 'Devis déjà répondu' }, 409);
    if (!devis.token) return json({ erreur: 'Ce devis n\'a pas de lien actif' }, 409);
    if (devis.expire_le && new Date(devis.expire_le).getTime() < Date.now()) {
      return json({ erreur: 'Le lien de ce devis a expiré' }, 409);
    }

    // Deux parents, deux boîtes mail, un seul et même lien — comme pour le
    // dossier de familiarisation. Les adresses sont figées à l'envoi.
    const adresses = String(devis.destinataires || '')
      .split(/[,;]/).map((a: string) => a.trim()).filter(Boolean);
    if (!adresses.length) return json({ erreur: 'Aucune adresse sur ce devis' }, 400);

    const [pre, creche] = await Promise.all([
      sb.from('preinscriptions').select('prenom,nom')
        .eq('id', devis.preinscription_id).maybeSingle(),
      devis.creche_id
        ? sb.from('creches').select('name').eq('id', devis.creche_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const racine = base.replace(/[^/]*\.html?(\?.*)?$/i, '').replace(/\/*$/, '/');
    const lien = racine + 'devis.html?t=' + devis.token;
    const prenom = (pre.data?.prenom || 'votre enfant').trim();

    try {
      await sendEmail(
        adresses,
        relance
          ? `Rappel — le devis d'accueil de ${prenom}`
          : `Le devis d'accueil de ${prenom}`,
        corpsHtml({
          enfant: ((pre.data?.prenom || '') + ' ' + (pre.data?.nom || '')).trim() || 'votre enfant',
          creche: creche.data?.name || '',
          lien,
          expire: devis.expire_le,
          mensuel: eur(devis.total_mensuel),
          reste: devis.reste_a_charge != null ? eur(devis.reste_a_charge) : null,
          relance: !!relance,
        }),
      );
    } catch (mailErr) {
      console.error('[envoyer-devis] SMTP', mailErr);
      return json({ erreur: "L'e-mail n'a pas pu être envoyé" }, 502);
    }

    // Le compteur n'est incrémenté qu'ici, une fois l'envoi réellement accepté :
    // compté côté application, il monterait aussi quand le mail échoue.
    if (relance) {
      await sb.from('devis').update({
        relances: (devis.relances || 0) + 1,
        derniere_relance: new Date().toISOString(),
      }).eq('id', devis.id);
    }

    return json({ ok: true });
  } catch (e) {
    console.error('[envoyer-devis]', e);
    return json({ erreur: 'Erreur serveur' }, 500);
  }
});
