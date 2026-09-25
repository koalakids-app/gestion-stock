// ============================================================================
// supabase/functions/envoyer-confirmation-visite/index.ts
// Koala Kids — septembre 2026
//
// Envoie à la famille un mail de confirmation quand une visite de la crèche
// est planifiée sur sa demande de préinscription. Appelée depuis
// inscriptions.html, qui présente la clé anon et non le JWT de la direction :
// cette fonction se déploie donc, comme les autres, avec
//
//   supabase functions deploy envoyer-confirmation-visite --no-verify-jwt
//
// COMME ELLE N'EST PAS PROTÉGÉE PAR UN JWT, elle ne reçoit AUCUN contenu à
// expédier : on ne lui passe qu'un identifiant de préinscription. Elle relit
// elle-même en base la date, l'heure, l'enfant, la crèche et les adresses des
// parents destinataires.
//
// Pas de lien ni de jeton ici : contrairement au devis ou au contrat, il n'y a
// rien à signer — seulement une date à confirmer.
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

// Le prénom du membre de l'équipe qui a cliqué sur « Envoyer », transmis par
// l'appli. Jamais inséré tel quel dans un en-tête : un retour à la ligne y
// glisserait un en-tête arbitraire (injection SMTP).
const nomExpediteur = (s: unknown) => {
  const v = typeof s === 'string' ? s.replace(/[\r\n<>]/g, '').trim() : '';
  return v.slice(0, 60) || 'Koala Kids';
};

const dfr = (d: string) => {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return d; }
};

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

async function sendEmail(to: string[], subject: string, html: string, expediteur?: string) {
  const user = Deno.env.get('GMAIL_USER');
  const pass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!user || !pass) {
    throw new Error('Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).');
  }
  // "From" doit obligatoirement être l'adresse authentifiée elle-même : Gmail
  // rejette silencieusement tout expéditeur différent du compte SMTP utilisé.
  // Seul le nom affiché varie, selon qui a cliqué sur « Envoyer ».
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
      from: `${nomExpediteur(expediteur)} de Koalakids <${user}>`,
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
  enfant: string; creche: string; adresse: string; date: string; heure: string;
  telephone: string; enseigne: string;
}) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F6FC;padding:24px 12px;
    font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2740;line-height:1.6">
    <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;
      border:1px solid #E3E1EF">
      <table role="presentation" width="100%" style="border-collapse:collapse">
        <tr>
          <td style="background:#fff;padding:20px 24px;text-align:center">
            <img src="https://koalakids-app.github.io/gestion-stock/logo-koalakids.png" alt="Koala Kids"
              width="220" style="display:inline-block;height:auto">
          </td>
        </tr>
        <tr>
          <td style="background:#3D3580;color:#fff;padding:18px 24px">
            <div style="font-size:20px;font-weight:700">Votre visite est confirmée</div>
            <div style="font-size:14px;opacity:.85;margin-top:3px">${esc(o.enseigne)}${o.creche ? ' · ' + esc(o.creche) : ''}</div>
          </td>
        </tr>
      </table>
      <div style="padding:24px">
        <p style="margin:0 0 16px;font-size:15px">Bonjour,</p>
        <p style="margin:0 0 18px;font-size:15px">
          Nous confirmons la visite de la crèche pour <b>${esc(o.enfant)}</b>.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 20px;
          border-top:1px solid #E3E1EF;border-bottom:1px solid #E3E1EF;padding:8px 0">
          <tr><td style="padding:4px 0;font-size:15px">Date</td>
            <td style="padding:4px 0;font-size:15px;text-align:right;font-weight:700;text-transform:capitalize">${esc(o.date)}</td></tr>
          ${o.heure ? `<tr><td style="padding:4px 0;font-size:15px">Heure</td>
            <td style="padding:4px 0;font-size:15px;text-align:right;font-weight:700">${esc(o.heure)}</td></tr>` : ''}
          ${o.creche ? `<tr><td style="padding:4px 0;font-size:15px">Crèche</td>
            <td style="padding:4px 0;font-size:15px;text-align:right;font-weight:700">${esc(o.creche)}</td></tr>` : ''}
          ${o.adresse ? `<tr><td style="padding:4px 0;font-size:15px">Adresse</td>
            <td style="padding:4px 0;font-size:15px;text-align:right;font-weight:700">${esc(o.adresse)}</td></tr>` : ''}
        </table>
        <p style="margin:0 0 18px;font-size:15px">
          Un empêchement, un changement d'horaire ? Répondez simplement à cet e-mail
          ${o.telephone ? `ou appelez-nous au <b>${esc(o.telephone)}</b>` : ''}.
        </p>
        <p style="margin:0;font-size:15px">À très vite,<br>L'équipe ${esc(o.enseigne)}</p>
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

  if (!Deno.env.get('GMAIL_USER') || !Deno.env.get('GMAIL_APP_PASSWORD')) {
    console.error('[envoyer-confirmation-visite] GMAIL_USER / GMAIL_APP_PASSWORD absente(s)');
    return json({ erreur: 'Service de mail non configuré' }, 500);
  }

  try {
    const { preinscription_id, expediteur } = await req.json();
    if (!preinscription_id) return json({ erreur: 'Préinscription manquante' }, 400);

    const { data: pre } = await sb.from('preinscriptions')
      .select('prenom,nom,date_visite,heure_visite,creche_id')
      .eq('id', preinscription_id).maybeSingle();
    if (!pre) return json({ erreur: 'Préinscription introuvable' }, 404);
    if (!pre.date_visite) return json({ erreur: 'Aucune visite programmée sur cette fiche' }, 409);

    const { data: parents } = await sb.from('preinscriptions_parents')
      .select('email,destinataire').eq('preinscription_id', preinscription_id);
    const adresses = (parents || [])
      .filter((p: { destinataire: boolean; email: string | null }) => p.destinataire && p.email && p.email.indexOf('@') > 0)
      .map((p: { email: string }) => p.email.trim());
    if (!adresses.length) return json({ erreur: 'Aucune adresse e-mail de destinataire sur cette fiche' }, 400);

    let creche = '', adresse = '', etab: Record<string, unknown> = {};
    if (pre.creche_id) {
      const [cr, et] = await Promise.all([
        sb.from('creches').select('name,addr').eq('id', pre.creche_id).maybeSingle(),
        sb.from('etablissements').select('raison_sociale,telephone')
          .eq('creche_id', pre.creche_id).maybeSingle(),
      ]);
      creche = (cr.data && cr.data.name) || '';
      adresse = (cr.data && cr.data.addr) || '';
      etab = et.data || {};
    }

    const prenom = (pre.prenom || 'votre enfant').trim();
    const enfant = ((pre.prenom || '') + ' ' + (pre.nom || '')).trim() || 'votre enfant';
    const enseigne = String(etab.raison_sociale || 'Koala Kids');

    try {
      await sendEmail(
        adresses,
        `Confirmation de votre visite — ${prenom}`,
        corpsHtml({
          enfant,
          creche,
          adresse,
          date: dfr(pre.date_visite),
          heure: pre.heure_visite ? String(pre.heure_visite).slice(0, 5) : '',
          telephone: String(etab.telephone || ''),
          enseigne,
        }),
        expediteur,
      );
    } catch (mailErr) {
      console.error('[envoyer-confirmation-visite] SMTP', mailErr);
      return json({ erreur: "L'e-mail n'a pas pu être envoyé" }, 502);
    }

    return json({ ok: true });
  } catch (e) {
    console.error('[envoyer-confirmation-visite]', e);
    return json({ erreur: 'Erreur serveur' }, 500);
  }
});
