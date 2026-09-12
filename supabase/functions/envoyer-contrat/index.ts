// ============================================================================
// supabase/functions/envoyer-contrat/index.ts
// Koala Kids — septembre 2026
//
// Envoie à la famille le lien de signature de son contrat d'accueil.
// Décalquée d'envoyer-devis.
//
// DEUX PRINCIPES, repris tels quels :
//
//   • La fonction ne reçoit QU'UN identifiant de contrat. Elle relit tout le
//     reste en base — destinataires, jeton, montants. Connaître son URL ne
//     permet donc pas d'écrire à une adresse arbitraire ni de fabriquer un
//     envoi.
//
//   • Le jeton n'est PAS fabriqué ici. Il l'est côté direction, sous RLS, par
//     quelqu'un qui a le droit d'envoyer le contrat. Une edge function ne doit
//     jamais pouvoir créer un accès de sa propre initiative.
//
// Envoi par SMTP Gmail plutôt que Resend : Resend exige un domaine expéditeur
// vérifié (DNS), pas encore disponible (koalakids.fr en attente d'accès DNS).
// Un compte Gmail avec validation en deux étapes + mot de passe d'application
// suffit, sans dépendance à un domaine.
//
// VARIABLES D'ENVIRONNEMENT : GMAIL_USER, GMAIL_APP_PASSWORD, APP_URL.
//
// DÉPLOIEMENT : depuis le tableau de bord, *Verify JWT* DÉSACTIVÉ.
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

const esc = (s: unknown) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const eur = (n: unknown) => {
  const v = Math.round(Number(n || 0) * 100) / 100;
  const p = Math.abs(v).toFixed(2).replace('.', ',').split(',');
  return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + p[1] + ' €';
};

const dfr = (d: unknown) => {
  if (!d) return '';
  const p = String(d).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '';
};

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  try {
    const user = Deno.env.get('GMAIL_USER');
    const pass = Deno.env.get('GMAIL_APP_PASSWORD');
    const appUrl = Deno.env.get('APP_URL');
    // Ces trois messages sont lus tels quels par la direction : ils doivent
    // dire quoi faire, pas seulement que ça a échoué.
    if (!user) return json({ erreur: "GMAIL_USER n'est pas renseignée dans les variables de la fonction." }, 500);
    if (!pass) return json({ erreur: "GMAIL_APP_PASSWORD n'est pas renseignée dans les variables de la fonction." }, 500);
    if (!appUrl) return json({ erreur: "APP_URL n'est pas renseignée dans les variables de la fonction." }, 500);

    const body = await req.json();
    const id = String(body.contrat_id || '');
    const relance = !!body.relance;
    if (!id) return json({ erreur: 'Identifiant de contrat manquant.' }, 400);

    const { data: c, error } = await sb.from('contrats').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!c) return json({ erreur: 'Contrat introuvable.' }, 404);
    if (!c.token || !c.envoye_le) {
      return json({ erreur: "Ce contrat n'a pas encore de lien de signature." }, 409);
    }
    if (c.repondu_le) return json({ erreur: 'Ce contrat a déjà reçu une réponse.' }, 409);

    const adresses = String(c.destinataires || '')
      .split(',').map((x) => x.trim()).filter((x) => x.includes('@'));
    if (!adresses.length) {
      return json({ erreur: "Aucune adresse e-mail de destinataire n'est enregistrée sur ce contrat." }, 400);
    }

    // Le nom de l'enfant : sur la fiche enfant après la bascule, sur la demande
    // avant. On regarde l'enfant d'abord, c'est la source la plus à jour.
    let prenom = '';
    if (c.enfant_id) {
      const { data } = await sb.from('enfants').select('prenom').eq('id', c.enfant_id).maybeSingle();
      prenom = (data && data.prenom) || '';
    }
    if (!prenom && c.preinscription_id) {
      const { data } = await sb.from('preinscriptions').select('prenom')
        .eq('id', c.preinscription_id).maybeSingle();
      prenom = (data && data.prenom) || '';
    }

    let creche = '', etab: Record<string, unknown> = {};
    if (c.creche_id) {
      const [cr, et] = await Promise.all([
        sb.from('creches').select('name').eq('id', c.creche_id).maybeSingle(),
        sb.from('etablissements').select('raison_sociale,telephone,email')
          .eq('creche_id', c.creche_id).maybeSingle(),
      ]);
      creche = (cr.data && cr.data.name) || '';
      etab = et.data || {};
    }

    const racine = String(appUrl).replace(/\/+$/, '');
    // `signature-contrat.html`, jamais `contrats.html` : ce dernier est l'écran
    // de la direction. Une lettre d'écart, et le lien envoyait la famille sur
    // la liste de tous les dossiers du réseau.
    const lien = `${racine}/signature-contrat.html?t=${c.token}`;
    const enseigne = String(etab.raison_sociale || 'Koala Kids');
    const avenant = c.type === 'avenant';

    const objet = avenant
      ? `Avenant à votre contrat d'accueil${prenom ? ` — ${prenom}` : ''}`
      : `Votre contrat d'accueil${prenom ? ` — ${prenom}` : ''}${relance ? ' (rappel)' : ''}`;

    const intro = relance
      ? `Nous n'avons pas encore reçu votre signature. Le lien ci-dessous est toujours valable.`
      : avenant
        ? `Voici l'avenant à votre contrat d'accueil${prenom ? `, pour ${esc(prenom)}` : ''}. Il ne modifie que ce qui change ; le contrat d'origine reste en vigueur pour le reste.`
        : `Voici votre contrat d'accueil${prenom ? `, pour ${esc(prenom)}` : ''}${creche ? ` à la crèche ${esc(creche)}` : ''}. Vous pouvez le lire et le signer en ligne, depuis votre téléphone.`;

    const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#FDF8F2;font-family:Helvetica,Arial,sans-serif;color:#2B2740">
<div style="max-width:560px;margin:0 auto;padding:24px 18px">
  <div style="background:#4A3F9F;color:#fff;border-radius:16px 16px 0 0;padding:22px 20px">
    <div style="font-size:21px;font-weight:800">${esc(enseigne)}</div>
    <div style="font-size:14px;opacity:.85;margin-top:2px">${avenant ? 'Avenant au contrat d\'accueil' : 'Contrat d\'accueil'}${c.numero ? ' · ' + esc(c.numero) : ''}</div>
  </div>
  <div style="background:#fff;border:2px solid #EFE9F5;border-top:none;border-radius:0 0 16px 16px;padding:22px 20px">
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">Bonjour,</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6">${intro}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14.5px;margin:0 0 18px">
      ${c.date_debut ? `<tr><td style="padding:6px 0;color:#8E8AA8">Début de l'accueil</td><td style="padding:6px 0;text-align:right;font-weight:700">${dfr(c.date_debut)}</td></tr>` : ''}
      ${c.date_fin ? `<tr><td style="padding:6px 0;color:#8E8AA8">Fin de l'accueil</td><td style="padding:6px 0;text-align:right;font-weight:700">${dfr(c.date_fin)}</td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#8E8AA8">Mensualité</td><td style="padding:6px 0;text-align:right;font-weight:700">${eur(c.total_mensuel)}</td></tr>
      ${c.reste_a_charge != null ? `<tr><td style="padding:6px 0;color:#8E8AA8">Reste à charge estimé</td><td style="padding:6px 0;text-align:right;font-weight:700">${eur(c.reste_a_charge)}</td></tr>` : ''}
    </table>
    <div style="text-align:center;margin:22px 0">
      <a href="${lien}" style="display:inline-block;background:#F47920;color:#fff;text-decoration:none;font-weight:800;font-size:16px;padding:15px 28px;border-radius:14px">Lire et signer le contrat</a>
    </div>
    <p style="margin:0 0 6px;font-size:13px;color:#8E8AA8;line-height:1.6">Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :</p>
    <p style="margin:0 0 16px;font-size:12.5px;color:#4A3F9F;word-break:break-all">${esc(lien)}</p>
    ${c.expire_le ? `<p style="margin:0 0 16px;font-size:13px;color:#8E8AA8;line-height:1.6">Ce lien est valable jusqu'au <b>${dfr(c.expire_le)}</b>.</p>` : ''}
    <p style="margin:0;font-size:14.5px;line-height:1.6">À très bientôt,<br>L'équipe ${esc(enseigne)}</p>
  </div>
  <p style="text-align:center;font-size:12px;color:#8E8AA8;margin:16px 0 0;line-height:1.7">
    ${esc(enseigne)}${etab.telephone ? ' · ' + esc(etab.telephone) : ''}${etab.email ? ' · ' + esc(etab.email) : ''}
  </p>
</div>
</body></html>`;

    try {
      await sendEmail(adresses, objet, html);
    } catch (mailErr) {
      // Le message d'erreur (identifiants Gmail refusés, quota dépassé…) part
      // dans les logs : il doit dire quoi faire, pas seulement que ça a
      // échoué.
      console.error('[envoyer-contrat] SMTP', mailErr);
      return json({ erreur: `L'e-mail n'a pas pu être envoyé : ${String(mailErr).slice(0, 300)}` }, 502);
    }

    // La relance est comptée ICI, après un envoi réussi : la compter avant
    // ferait grimper le compteur sur des mails jamais partis.
    if (relance) {
      await sb.from('contrats').update({
        relances: (Number(c.relances) || 0) + 1,
        derniere_relance: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', c.id);
    }

    return json({ ok: true, destinataires: adresses });
  } catch (e) {
    console.error('[envoyer-contrat]', e);
    return json({ erreur: (e as Error).message || 'Erreur serveur' }, 500);
  }
});
