// ============================================================================
// supabase/functions/envoyer-contrat-signe/index.ts
// Koala Kids — septembre 2026
//
// Envoie à la famille le contrat d'accueil une fois signé ET contresigné,
// en pièce jointe PDF. Décalquée d'envoyer-contrat.
//
// MÊMES DEUX PRINCIPES, repris tels quels :
//
//   • La fonction ne reçoit QU'UN identifiant de contrat (+ le PDF déjà
//     redessiné côté direction). Elle relit le reste en base — destinataires,
//     statut. Connaître son URL ne permet donc pas d'écrire à une adresse
//     arbitraire ni de fabriquer un envoi.
//
//   • Elle n'envoie QUE si le contrat est bien au statut `contresigne`. Un
//     appel prématuré (avant la seconde signature) est refusé.
//
// Envoi par SMTP Gmail, comme envoyer-contrat.
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

async function sendEmail(
  to: string[],
  subject: string,
  html: string,
  attachment: { filename: string; content: string },
) {
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
      attachments: [
        {
          filename: attachment.filename,
          content: attachment.content,
          encoding: 'base64',
        },
      ],
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
    // Ces messages sont lus tels quels par la direction : ils doivent dire
    // quoi faire, pas seulement que ça a échoué.
    if (!user) return json({ erreur: "GMAIL_USER n'est pas renseignée dans les variables de la fonction." }, 500);
    if (!pass) return json({ erreur: "GMAIL_APP_PASSWORD n'est pas renseignée dans les variables de la fonction." }, 500);

    const body = await req.json();
    const id = String(body.contrat_id || '');
    const pdfBase64 = String(body.pdf_base64 || '');
    const nomFichier = String(body.nom_fichier || 'contrat.pdf');
    if (!id) return json({ erreur: 'Identifiant de contrat manquant.' }, 400);
    if (!pdfBase64) return json({ erreur: 'PDF du contrat manquant.' }, 400);

    const { data: c, error } = await sb.from('contrats').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!c) return json({ erreur: 'Contrat introuvable.' }, 404);
    if (c.statut !== 'contresigne') {
      return json({ erreur: "Ce contrat n'est pas encore signé des deux côtés." }, 409);
    }

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

    let etab: Record<string, unknown> = {};
    if (c.creche_id) {
      const { data } = await sb.from('etablissements').select('raison_sociale,telephone,email')
        .eq('creche_id', c.creche_id).maybeSingle();
      etab = data || {};
    }

    const enseigne = String(etab.raison_sociale || 'Koala Kids');
    const avenant = c.type === 'avenant';

    const objet = avenant
      ? `Votre avenant signé${prenom ? ` — ${prenom}` : ''}`
      : `Votre contrat d'accueil signé${prenom ? ` — ${prenom}` : ''}`;

    const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#FDF8F2;font-family:Helvetica,Arial,sans-serif;color:#2B2740">
<div style="max-width:560px;margin:0 auto;padding:24px 18px">
  <div style="background:#4A3F9F;color:#fff;border-radius:16px 16px 0 0;padding:22px 20px">
    <div style="font-size:21px;font-weight:800">${esc(enseigne)}</div>
    <div style="font-size:14px;opacity:.85;margin-top:2px">${avenant ? 'Avenant signé' : 'Contrat d\'accueil signé'}${c.numero ? ' · ' + esc(c.numero) : ''}</div>
  </div>
  <div style="background:#fff;border:2px solid #EFE9F5;border-top:none;border-radius:0 0 16px 16px;padding:22px 20px">
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">Bonjour,</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6">${avenant ? 'Votre avenant' : 'Votre contrat d\'accueil'}${prenom ? `, pour ${esc(prenom)},` : ''} est désormais signé des deux côtés. Vous en trouverez une copie complète en pièce jointe.</p>
    <p style="margin:0;font-size:14.5px;line-height:1.6">À très bientôt,<br>L'équipe ${esc(enseigne)}</p>
  </div>
  <p style="text-align:center;font-size:12px;color:#8E8AA8;margin:16px 0 0;line-height:1.7">
    ${esc(enseigne)}${etab.telephone ? ' · ' + esc(etab.telephone) : ''}${etab.email ? ' · ' + esc(etab.email) : ''}
  </p>
</div>
</body></html>`;

    try {
      await sendEmail(adresses, objet, html, { filename: nomFichier, content: pdfBase64 });
    } catch (mailErr) {
      // Le message d'erreur (identifiants Gmail refusés, quota dépassé…) part
      // dans les logs : il doit dire quoi faire, pas seulement que ça a
      // échoué.
      console.error('[envoyer-contrat-signe] SMTP', mailErr);
      return json({ erreur: `L'e-mail n'a pas pu être envoyé : ${String(mailErr).slice(0, 300)}` }, 502);
    }

    return json({ ok: true, destinataires: adresses });
  } catch (e) {
    console.error('[envoyer-contrat-signe]', e);
    return json({ erreur: (e as Error).message || 'Erreur serveur' }, 500);
  }
});
