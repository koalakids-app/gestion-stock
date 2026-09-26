// ============================================================================
// supabase/functions/signature-otp/index.ts
// Koala Kids — septembre 2026
//
// Renforcement de la signature du contrat de travail (documents.html, modèle
// contrat_travail) : un code à usage unique (OTP) à 6 chiffres, envoyé à
// l'adresse e-mail de la fiche collaborateur/trice (table `employes`),
// vérifié CÔTÉ SERVEUR avant que la signature du/de la salarié(e) ne soit
// acceptée comme valide.
//
// Décalquée de supabase/functions/dossier-contrat (renforcement de la
// signature famille du contrat d'accueil) — voir sql/contrats_signature_renforcee.sql
// pour l'original. Même trois principes, appliqués à `documents_reponses` au
// lieu de `contrats` :
//   1. code à 6 chiffres, valable 10 minutes, exigé en plus du tracé ;
//   2. empreinte SHA-256 du PDF généré au moment de la signature (calculée
//      côté client — jsPDF ne tourne pas ici — puis simplement conservée) ;
//   3. chaque étape journalisée avec IP et user-agent dans
//      `documents_reponses_preuves`, table d'ajout seul.
//
// ⚠️ CONTRAINTE CONNUE (septembre 2026) : le canal 'sms' n'est pas
// implémenté — aucun prestataire SMS n'est en place. Le canal 'email' utilise
// le même SMTP Gmail que les autres envois de l'application (envoyer-contrat,
// envoyer-code-pointage…) : IL FONCTIONNE dès lors que GMAIL_USER et
// GMAIL_APP_PASSWORD sont configurés côté Supabase (`supabase secrets list`
// pour vérifier). C'est la case « Activer la vérification par code » de
// Paramètres → Le réseau qui décide si l'application l'exige réellement —
// tant qu'elle n'est pas cochée, la signature reste possible sans code
// (mode dégradé), avec un indicateur visuel « non vérifiée par code ».
//
// Ceci NE fait PAS de cette signature une signature électronique AVANCÉE au
// sens eIDAS (pas d'identifiant de confiance qualifié, pas d'horodatage
// qualifié) : c'est un renforcement du dossier de preuve, pas un changement
// de qualification juridique. À faire valider par un avocat en droit social
// avant mise en production réelle (texte de consentement, durée de
// conservation du journal de preuve).
//
// Appelée depuis deux pages :
//   - documents.html (ctEnvoyerOtp/ctVerifierOtp → callFn), avec l'anon key,
//     session direction/référente authentifiée — filtrage par droits fait
//     côté client (module visible aux comptes direction/référente seulement).
//   - signature.html (page PUBLIQUE, sans session — signature à distance du
//     contrat de travail par le/la salarié(e) sur son propre téléphone),
//     avec l'anon key SEULE. C'est pour cette raison que 'envoyer' et
//     'verifier' ne prennent en entrée que reponse_id/employe_id/code — des
//     identifiants opaques (uuid), jamais une liste consultable — et que
//     l'action 'statut_token' ne résout que depuis le jeton de
//     `signatures_pending` (déjà secret, généré par startQr()), sans jamais
//     exposer autre chose qu'un e-mail masqué.
// Cette fonction utilise le service role pour lire l'e-mail de l'employé et
// écrire le code/les preuves — elle ne renvoie jamais le code lui-même, ni
// l'adresse e-mail complète (masquée), au client.
//
// Déploiement : supabase functions deploy signature-otp
//   (vérification JWT par défaut — la clé anon seule suffit à passer cette
//   vérification, appelant authentifié ou non ; c'est ce qui permet l'appel
//   public depuis signature.html)
// Secrets nécessaires (mêmes noms que les autres fonctions d'envoi d'e-mail) :
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
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') || 'inconnue';
}

async function sha256Hex(texte: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function genererCode(): string {
  const octet = new Uint32Array(1);
  crypto.getRandomValues(octet);
  return String(100000 + (octet[0] % 900000));
}

const RESEAU_CFG_ID = '00000000-0000-0000-0000-000000000003';

function masquerEmail(email: string): string {
  const [u, d] = String(email).split('@');
  if (!d) return '···';
  return (u[0] || '·') + '···@' + d;
}

async function journaliser(
  reponseId: string, evenement: string, req: Request, detail?: Record<string, unknown>,
) {
  try {
    await sb.from('documents_reponses_preuves').insert({
      reponse_id: reponseId,
      evenement,
      ip: clientIp(req),
      user_agent: req.headers.get('user-agent') || 'inconnu',
      detail: detail || null,
    });
  } catch (e) {
    console.error('[signature-otp] journalisation', evenement, e);
  }
}

async function sendEmail(to: string[], subject: string, html: string) {
  const user = Deno.env.get('GMAIL_USER');
  const pass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!user || !pass) {
    throw new Error('Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).');
  }
  const client = new SMTPClient({
    connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: user, password: pass } },
  });
  try {
    await client.send({ from: user, to, subject, content: 'Ce message nécessite un client de messagerie compatible HTML.', html });
  } finally {
    await client.close();
  }
}

function emailCodeHtml(code: string, enseigne: string, nomSalarie: string) {
  return `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#FDF8F2;font-family:Helvetica,Arial,sans-serif;color:#2B2740">
<div style="max-width:480px;margin:0 auto;padding:24px 18px">
  <div style="background:#fff;border:2px solid #EFE9F5;border-radius:16px;padding:24px 20px;text-align:center">
    <div style="font-size:14px;color:#8E8AA8;margin-bottom:6px">${enseigne} — vérification d'identité avant signature</div>
    <div style="font-size:34px;font-weight:800;letter-spacing:6px;color:#4A3F9F;margin:10px 0">${code}</div>
    <p style="margin:10px 0 0;font-size:13.5px;color:#8E8AA8;line-height:1.6">
      Bonjour ${nomSalarie || ''}, saisissez ce code pour confirmer votre identité avant de signer votre contrat
      de travail. Il est valable 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.
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

    // ---------------------------------------------------------- STATUT_TOKEN
    // Signature à distance (signature.html, page publique, sans session) :
    // le téléphone du/de la salarié(e) ne connaît que le jeton de
    // `signatures_pending`, jamais l'identifiant de réponse — cette action
    // fait la résolution jeton → réponse et dit si un code est exigé avant
    // de laisser signer, sans jamais exposer autre chose qu'un e-mail masqué.
    if (action === 'statut_token') {
      const token = String(body.token || '');
      if (!token) return json({ erreur: 'Jeton manquant.' }, 400);
      const { data: sp, error: spErr } = await sb
        .from('signatures_pending').select('reponse_id,role_sign,document_id,signed_at')
        .eq('token', token).maybeSingle();
      if (spErr) throw spErr;
      if (!sp || !sp.reponse_id || sp.role_sign !== 'salarie') {
        return json({ ok: true, otp_required: false });
      }
      const { data: docKoala } = await sb
        .from('documents_koala').select('template_key').eq('id', sp.document_id).maybeSingle();
      if (!docKoala || docKoala.template_key !== 'contrat_travail') {
        return json({ ok: true, otp_required: false });
      }
      const { data: rep } = await sb
        .from('documents_reponses').select('otp_verifie_le,otp_employe_id,donnees')
        .eq('id', sp.reponse_id).maybeSingle();
      const donnees = (rep && (rep.donnees as Record<string, unknown>)) || {};
      const employeId = (rep && rep.otp_employe_id) || (donnees.salarie_employe_id as string) || null;
      // reseau_config est propre à chaque organisation : on la résout via
      // l'org_id de la crèche du/de la salarié(e), avec la ligne historique
      // Koala Kids en secours si l'employé ou sa crèche est introuvable.
      let orgId: string | null = null;
      if (employeId) {
        const { data: emp0 } = await sb
          .from('employes').select('creche_id').eq('id', employeId).maybeSingle();
        if (emp0?.creche_id) {
          const { data: crecheOrg } = await sb
            .from('creches').select('org_id').eq('id', emp0.creche_id).maybeSingle();
          orgId = crecheOrg?.org_id || null;
        }
      }
      const { data: reseau } = orgId
        ? await sb.from('reseau_config').select('config').eq('org_id', orgId).maybeSingle()
        : await sb.from('reseau_config').select('config').eq('id', RESEAU_CFG_ID).maybeSingle();
      const otpActive = !!(reseau && reseau.config && (reseau.config as Record<string, unknown>).otp_signature_active);
      let destinationMasquee: string | null = null;
      if (employeId) {
        const { data: emp } = await sb.from('employes').select('email').eq('id', employeId).maybeSingle();
        if (emp && emp.email) destinationMasquee = masquerEmail(emp.email);
      }
      return json({
        ok: true,
        otp_required: otpActive,
        otp_verified: !!(rep && rep.otp_verifie_le),
        reponse_id: sp.reponse_id,
        employe_id: employeId,
        destination_masquee: destinationMasquee,
      });
    }

    const reponseId = String(body.reponse_id || '');
    if (!reponseId) return json({ erreur: 'Identifiant de réponse manquant.' }, 400);

    const { data: reponse, error: rErr } = await sb
      .from('documents_reponses').select('*').eq('id', reponseId).maybeSingle();
    if (rErr) throw rErr;
    if (!reponse) return json({ erreur: 'Réponse introuvable.' }, 404);

    // -------------------------------------------------------------- AUDITER
    // Mode dégradé (OTP non activé) : capture IP/user-agent au moment de la
    // signature, sans code — aucune écriture, juste ce que le serveur voit.
    if (action === 'auditer') {
      return json({ ok: true, ip: clientIp(req), user_agent: req.headers.get('user-agent') || 'inconnu' });
    }

    // -------------------------------------------------------------- ENVOYER
    if (action === 'envoyer') {
      const employeId = String(body.employe_id || '');
      if (!employeId) return json({ erreur: 'Sélectionnez la fiche du/de la salarié(e).' }, 400);
      const canal = String(body.canal || 'email');
      if (canal !== 'email') {
        return json({ erreur: "L'envoi par SMS n'est pas disponible : aucun prestataire SMS n'est configuré pour l'instant. Utilisez le canal e-mail." }, 501);
      }

      const { data: employe, error: eErr } = await sb
        .from('employes').select('id,prenom,nom,email,creche_id').eq('id', employeId).maybeSingle();
      if (eErr) throw eErr;
      if (!employe) return json({ erreur: 'Fiche salarié introuvable.' }, 404);
      if (!employe.email) return json({ erreur: "Aucun e-mail enregistré sur cette fiche collaborateur/trice." }, 400);

      // Anti-rafale : même garde-fou que dossier-contrat.
      if (reponse.otp_dernier_envoi &&
          Date.now() - new Date(reponse.otp_dernier_envoi as string).getTime() < 45_000) {
        return json({ erreur: 'Merci de patienter avant de redemander un code.' }, 429);
      }
      if ((Number(reponse.otp_envois) || 0) >= 5) {
        return json({ erreur: 'Trop de demandes de code pour ce contrat. Renvoyez-le depuis une nouvelle saisie si besoin.' }, 429);
      }

      const code = genererCode();
      const maintenant = new Date();
      const hash = await sha256Hex(code + ':' + reponseId);

      const { error: uErr } = await sb.from('documents_reponses').update({
        otp_code_hash: hash,
        otp_expire_le: new Date(maintenant.getTime() + 10 * 60_000).toISOString(),
        otp_tentatives: 0,
        otp_envois: (Number(reponse.otp_envois) || 0) + 1,
        otp_dernier_envoi: maintenant.toISOString(),
        otp_employe_id: employeId,
      }).eq('id', reponseId);
      if (uErr) throw uErr;

      let enseigne = 'Koala Kids';
      if (employe.creche_id) {
        const { data: et } = await sb.from('etablissements')
          .select('raison_sociale').eq('creche_id', employe.creche_id).maybeSingle();
        enseigne = (et && et.raison_sociale) || enseigne;
      }

      try {
        await sendEmail(
          [employe.email],
          `Votre code de vérification — ${enseigne}`,
          emailCodeHtml(code, enseigne, employe.prenom || ''),
        );
      } catch (mailErr) {
        console.error('[signature-otp] envoi code', mailErr);
        return json({ erreur: `Le code n'a pas pu être envoyé : ${String((mailErr as Error).message || mailErr).slice(0, 200)}` }, 502);
      }

      await journaliser(reponseId, 'code_envoye', req, { employe_id: employeId });
      return json({ ok: true, expire_dans: 600, destination_masquee: masquerEmail(employe.email) });
    }

    // ------------------------------------------------------------- VERIFIER
    if (action === 'verifier') {
      const code = String(body.code || '').trim();
      if (!/^\d{6}$/.test(code)) return json({ erreur: 'Saisissez le code à 6 chiffres reçu par e-mail.' }, 400);
      if (!reponse.otp_code_hash || !reponse.otp_expire_le) {
        return json({ erreur: "Demandez d'abord un code de vérification." }, 409);
      }
      if (new Date(reponse.otp_expire_le as string).getTime() < Date.now()) {
        return json({ erreur: 'Ce code a expiré. Demandez-en un nouveau.' }, 409);
      }
      if ((Number(reponse.otp_tentatives) || 0) >= 5) {
        return json({ erreur: "Trop d'essais. Demandez un nouveau code." }, 429);
      }

      const hashRecu = await sha256Hex(code + ':' + reponseId);
      if (hashRecu !== reponse.otp_code_hash) {
        await sb.from('documents_reponses').update({
          otp_tentatives: (Number(reponse.otp_tentatives) || 0) + 1,
        }).eq('id', reponseId);
        await journaliser(reponseId, 'code_echec', req);
        return json({ erreur: 'Code incorrect.' }, 400);
      }

      const maintenant = new Date().toISOString();
      const { error: uErr } = await sb.from('documents_reponses').update({
        otp_verifie_le: maintenant,
        otp_code_hash: null,
        otp_expire_le: null,
        signature_ip: clientIp(req),
        signature_user_agent: req.headers.get('user-agent') || 'inconnu',
      }).eq('id', reponseId);
      if (uErr) throw uErr;

      await journaliser(reponseId, 'code_verifie', req);
      return json({
        ok: true,
        verified_at: maintenant,
        ip: clientIp(req),
        user_agent: req.headers.get('user-agent') || 'inconnu',
      });
    }

    // ------------------------------------------------------------- SIGNATURE
    // Enregistre l'empreinte du PDF (calculée côté client) et journalise
    // l'événement final. Appelée que le mode dégradé soit actif ou non.
    if (action === 'signature') {
      const empreinte = body.empreinte ? String(body.empreinte) : null;
      const sansOtp = !reponse.otp_verifie_le;
      const patch: Record<string, unknown> = {};
      if (empreinte) patch.signature_empreinte = empreinte;
      if (sansOtp) {
        patch.signature_ip = clientIp(req);
        patch.signature_user_agent = req.headers.get('user-agent') || 'inconnu';
      }
      if (Object.keys(patch).length) {
        const { error: uErr } = await sb.from('documents_reponses').update(patch).eq('id', reponseId);
        if (uErr) throw uErr;
      }
      await journaliser(reponseId, sansOtp ? 'signature_sans_otp' : 'signature', req, empreinte ? { empreinte } : undefined);
      return json({ ok: true, ip: clientIp(req), user_agent: req.headers.get('user-agent') || 'inconnu' });
    }

    // ------------------------------------------------------- MODIFICATION
    // Trace la correction d'un contrat déjà signé par la direction (bouton
    // « Modifier quand même » de documents.html).
    if (action === 'modification_direction') {
      const par = body.par ? String(body.par).slice(0, 200) : null;
      await journaliser(reponseId, 'modification_direction', req, par ? { par } : undefined);
      return json({ ok: true });
    }

    return json({ erreur: 'Action inconnue' }, 400);
  } catch (e) {
    console.error('[signature-otp]', e);
    return json({ erreur: (e as Error).message || 'Erreur serveur' }, 500);
  }
});
