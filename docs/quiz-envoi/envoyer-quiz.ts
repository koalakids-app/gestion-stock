// ============================================================================
// Edge function « envoyer-quiz » — PROJET QUIZ (phbcqxjzobzwuzetgbem)
//
// Envoie par mail (SMTP Gmail, même service que envoyer-devis du projet
// gestion-stock) le lien d'un quiz ou d'une micro-formation à une liste de
// personnes, avec un message rédigé une seule fois par l'envoyeur :
//   {prenom} {nom} {civilite} sont remplacés pour chaque destinataire,
//   {lien} devient un lien cliquable (s'il est absent, un bouton est ajouté).
// Chaque envoi — réussi ou en échec — est écrit dans `envois_quiz`.
//
// Règles :
//  - l'appelant doit être dans `envoyeurs_quiz` (vérifié ici, pas par le JWT) ;
//    une directrice technique ne peut écrire qu'à sa crèche ;
//  - le titre du quiz/module et le lien sont relus ou construits ICI, jamais
//    pris tels quels du navigateur ; seul le quiz/module publié est envoyable ;
//  - une personne déjà contactée pour ce quiz n'est pas ré-écrite, sauf en
//    mode `relance` (compteur et date de relance mis à jour, même lien) ;
//  - un seul mail peut porter DEUX quiz (parcours quiz, une semaine = 2 quiz) : l'appelant
//    passe `item_id_2` ; le message contient alors {lien} (1er quiz) et {lien2} (2e quiz),
//    même `ref` pour la personne. Chaque quiz a sa ligne dans `envois_quiz`. Un appel
//    avec `sonde: true` répond {ok:true, deux_liens:true} sans rien envoyer : admin.html
//    s'en sert pour savoir si cette version est déployée.
//  - 40 destinataires au plus par appel (limite de durée de la fonction) :
//    admin.html découpe les envois plus longs.
//  - pause de 1 s entre deux mails (2 s vers les adresses Microsoft) pour éviter les refus
//    5.7.1 des serveurs qui rejettent les envois en rafale.
//
// DÉPLOIEMENT : nom « envoyer-quiz », « Verify JWT » : ACTIVÉ.
// SECRETS dans le projet quiz :
//   GMAIL_USER, GMAIL_APP_PASSWORD   les mêmes que dans le projet gestion-stock
//   APP_URL   (facultatif) racine du quiz, défaut
//             https://koalakids-app.github.io/quiz-protocoles/
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

const MAX_PAR_APPEL = 40;
const LOGO = 'https://koalakids-app.github.io/gestion-stock/logo-koalakids.png';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const propre = (s: unknown, max = 200) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
const mailValide = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Pause entre deux mails : les envois en rafale depuis un compte Gmail sont refusés (5.7.1)
// par certains serveurs, surtout Microsoft (hotmail, outlook, live, msn). 40 destinataires
// au plus par appel : 40 x 2 s = 80 s au pire, sous la limite de durée de la fonction.
const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PAUSE_MS = 1000;
const PAUSE_MICROSOFT_MS = 2000;
const estMicrosoft = (email: string) => /@(hotmail|outlook|live|msn)\./i.test(email);

// Jamais un retour à la ligne ni de chevron dans le nom affiché : injection SMTP.
const nomExpediteur = (s: unknown) => {
  const v = typeof s === 'string' ? s.replace(/[\r\n<>]/g, '').trim() : '';
  return (v.split(/\s+/)[0] || '').slice(0, 60) || 'Koalakids';
};

// denomailer coupe les sujets non ASCII sans espace de continuation et casse
// les en-têtes : on envoie un sujet en ASCII pur (même parade qu'envoyer-devis).
function encodeSubject(subject: string): string {
  const s = subject.normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[—–]/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ')
    .replace(/^[=\s]+/, '').trim();
  return s || 'Koalakids';
}

async function envoyeur(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const sbUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
  );
  const { data: { user } } = await sbUser.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('envoyeurs_quiz')
    .select('creche').eq('user_id', user.id).maybeSingle();
  return data ? { id: user.id, creche: (data.creche as string | null) } : null;
}

type Dest = {
  ref?: string; civilite?: string; prenom: string; nom?: string; email: string;
  creche?: string; statut?: string; source: 'reseau' | 'manuel';
};

function construireLien(base: string, kind: string, itemId: string, d: Dest, ref: string) {
  const u = new URL(kind === 'quiz' ? 'index.html' : 'formations.html', base);
  u.searchParams.set(kind === 'quiz' ? 'quiz' : 'module', itemId);
  u.searchParams.set('ref', ref);
  if (d.prenom) u.searchParams.set('prenom', d.prenom);
  if (d.nom) u.searchParams.set('nom', d.nom);
  if (d.statut) u.searchParams.set('statut', d.statut);
  if (d.creche) u.searchParams.set('creche', d.creche);
  return u.toString();
}

function remplacer(modele: string, d: Dest, lien: string | null, html: boolean, lien2: string | null = null) {
  const v = (s: string) => (html ? esc(s) : s);
  let t = html ? esc(modele) : modele;
  t = t.replace(/\{prenom\}/gi, () => v(d.prenom))
       .replace(/\{nom\}/gi, () => v(d.nom || ''))
       .replace(/\{civilite\}/gi, () => v(d.civilite || ''));
  if (lien) {
    t = t.replace(/\{lien\}/gi, () =>
      html ? `<a href="${esc(lien)}" style="color:#4A3F9F;font-weight:700">${esc(lien)}</a>` : lien);
  }
  if (lien2) {
    t = t.replace(/\{lien2\}/gi, () =>
      html ? `<a href="${esc(lien2)}" style="color:#4A3F9F;font-weight:700">${esc(lien2)}</a>` : lien2);
  }
  return html ? t.replace(/\r?\n/g, '<br>') : t;
}

function corpsHtml(texteHtml: string, lien: string, avecBouton: boolean, creche: string) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F6FC;padding:24px 12px;
    font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2740;line-height:1.6">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E3E1EF">
      <div style="padding:20px 24px;text-align:center"><img src="${LOGO}" alt="Koalakids" width="200" style="height:auto"></div>
      <div style="background:#4A3F9F;color:#fff;padding:10px 24px;font-size:13px">Koalakids${creche ? ' · ' + esc(creche) : ''}</div>
      <div style="padding:24px;font-size:15px">${texteHtml}
        ${avecBouton ? `<p style="margin:24px 0 0;text-align:center"><a href="${esc(lien)}"
          style="display:inline-block;background:#E8621A;color:#fff;text-decoration:none;font-weight:700;
          padding:13px 28px;border-radius:11px">Accéder au questionnaire</a></p>
          <p style="margin:16px 0 0;font-size:12px;color:#8E8AA8;word-break:break-all">Si le bouton ne fonctionne pas : ${esc(lien)}</p>` : ''}
      </div>
    </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  const user = Deno.env.get('GMAIL_USER');
  const pass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!user || !pass) {
    console.error('[envoyer-quiz] GMAIL_USER / GMAIL_APP_PASSWORD absent(s)');
    return json({ erreur: 'Service de mail non configuré' }, 500);
  }
  const moi = await envoyeur(req);
  if (!moi) return json({ erreur: "Vous n'avez pas le droit d'envoyer des quiz." }, 403);

  let corps: { kind?: string; item_id?: string; item_id_2?: string; sonde?: boolean; objet?: string;
               message?: string; expediteur?: string; relance?: boolean; destinataires?: Dest[] };
  try { corps = await req.json(); } catch { return json({ erreur: 'Corps invalide' }, 400); }
  if (corps.sonde) return json({ ok: true, deux_liens: true });

  const kind = corps.kind === 'module' ? 'module' : corps.kind === 'quiz' ? 'quiz' : '';
  if (!kind || !corps.item_id) return json({ erreur: 'Quiz ou module manquant' }, 400);
  const message = String(corps.message || '').trim();
  if (!message) return json({ erreur: 'Le message est vide' }, 400);
  const liste = Array.isArray(corps.destinataires) ? corps.destinataires : [];
  if (!liste.length) return json({ erreur: 'Aucun destinataire' }, 400);
  if (liste.length > MAX_PAR_APPEL) {
    return json({ erreur: `${MAX_PAR_APPEL} destinataires au plus par envoi` }, 400);
  }

  // Titre et publication relus en base.
  const { data: item, error: eItem } = await sb.from(kind === 'quiz' ? 'quiz' : 'module')
    .select('id,titre,publie').eq('id', corps.item_id).maybeSingle();
  if (eItem) {
    // Lecture refusée ou impossible (droits, table) : ne pas la faire passer pour un quiz absent.
    console.error('[envoyer-quiz] lecture', kind, eItem);
    return json({ erreur: 'Lecture du ' + kind + ' impossible : ' + eItem.message }, 500);
  }
  if (!item) return json({ erreur: kind === 'quiz' ? 'Quiz introuvable' : 'Module introuvable' }, 404);
  if (!item.publie) return json({ erreur: 'Publiez-le avant de l\'envoyer : le lien ne fonctionnerait pas.' }, 409);

  // Deuxième quiz du même mail (quiz seulement), relu et vérifié comme le premier.
  let item2: { id: string; titre: string; publie: boolean } | null = null;
  if (corps.item_id_2) {
    if (kind !== 'quiz') return json({ erreur: 'Un deuxième lien n\'existe que pour les quiz' }, 400);
    if (corps.item_id_2 === item.id) return json({ erreur: 'Les deux quiz sont identiques' }, 400);
    if (!/\{lien2\}/i.test(message)) return json({ erreur: 'Le message doit contenir {lien2}' }, 400);
    const { data, error } = await sb.from('quiz').select('id,titre,publie').eq('id', corps.item_id_2).maybeSingle();
    if (error) return json({ erreur: 'Lecture du 2e quiz impossible : ' + error.message }, 500);
    if (!data) return json({ erreur: '2e quiz introuvable' }, 404);
    if (!data.publie) return json({ erreur: 'Publiez le 2e quiz avant de l\'envoyer : le lien ne fonctionnerait pas.' }, 409);
    item2 = data;
  }

  const base = (Deno.env.get('APP_URL') || 'https://koalakids-app.github.io/quiz-protocoles/')
    .replace(/[^/]*\.html?(\?.*)?$/i, '').replace(/\/*$/, '/');
  const objet = propre(corps.objet, 150) ||
    (kind === 'quiz' ? 'Votre questionnaire - Koalakids' : 'Votre formation - Koalakids');
  const aBouton = !/\{lien\}/i.test(message);
  const relance = !!corps.relance;
  const nomAffiche = nomExpediteur(corps.expediteur);

  const nouveauClient = () => new SMTPClient({
    connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: user, password: pass } },
  });
  let client = nouveauClient();
  let dejaEnvoye = false; // un mail est déjà parti dans cet appel : on espace le suivant

  const vus = new Set<string>();
  const resultats: { email: string; prenom: string; nom: string; etat: string; erreur?: string }[] = [];

  try {
    for (const brut of liste) {
      const d: Dest = {
        ref: propre(brut.ref, 80), civilite: propre(brut.civilite, 20), prenom: propre(brut.prenom, 80),
        nom: propre(brut.nom, 80), email: propre(brut.email, 200).toLowerCase(),
        creche: propre(brut.creche, 120), statut: propre(brut.statut, 60),
        source: brut.source === 'manuel' ? 'manuel' : 'reseau',
      };
      const res = (etat: string, erreur?: string) =>
        resultats.push({ email: d.email, prenom: d.prenom, nom: d.nom || '', etat, erreur });

      if (!d.prenom || !mailValide(d.email)) { res('echec', 'Prénom ou adresse mail invalide'); continue; }
      if (vus.has(d.email)) { res('doublon', 'Adresse en double dans la liste'); continue; }
      vus.add(d.email);
      if (moi.creche && d.creche !== moi.creche) { res('echec', 'Hors de votre crèche'); continue; }
      if (d.source === 'reseau' && !d.ref) { res('echec', 'Référence manquante'); continue; }

      // Déjà contactée pour ce quiz ?
      const { data: avant } = await sb.from('envois_quiz').select('id,ref,etat,nb_relances')
        .eq('kind', kind).eq('item_id', item.id).ilike('email', d.email)
        .order('envoye_le', { ascending: false }).limit(1).maybeSingle();
      if (avant && avant.etat === 'envoye' && !relance) { res('deja_envoye'); continue; }

      const idLigne = avant?.id || crypto.randomUUID();
      // Candidat saisi à la volée : son `ref` est l'id de sa ligne d'historique.
      const ref = avant?.ref || (d.source === 'manuel' ? idLigne : d.ref!);
      const lien = construireLien(base, kind, item.id, d, ref);
      const lien2 = item2 ? construireLien(base, kind, item2.id, d, ref) : null;

      let erreur: string | null = null;
      if (dejaEnvoye) await attendre(estMicrosoft(d.email) ? PAUSE_MICROSOFT_MS : PAUSE_MS);
      dejaEnvoye = true;
      try {
        await client.send({
          from: `${nomAffiche} de Koalakids <${user}>`,
          to: [d.email],
          subject: encodeSubject(remplacer(objet, d, lien, false, lien2)),
          content: remplacer(message, d, lien, false, lien2) + (aBouton ? '\r\n\r\n' + lien : ''),
          html: corpsHtml(remplacer(message, d, lien, true, lien2), lien, aBouton, d.creche || ''),
        });
      } catch (e) {
        erreur = String((e as Error).message || e).slice(0, 300);
        console.error('[envoyer-quiz] SMTP', d.email, erreur);
        try { await client.close(); } catch { /* connexion déjà rompue */ }
        client = nouveauClient();
      }

      const maintenant = new Date().toISOString();
      const noter = async (it: { id: string; titre: string }, av: typeof avant, id: string) => {
        if (av) {
          await sb.from('envois_quiz').update(erreur
            ? { etat: av.etat === 'envoye' ? 'envoye' : 'echec', erreur }
            : { etat: 'envoye', erreur: null,
                nb_relances: (av.nb_relances || 0) + (av.etat === 'envoye' ? 1 : 0),
                relance_le: av.etat === 'envoye' ? maintenant : null,
                ...(av.etat === 'envoye' ? {} : { envoye_le: maintenant }) },
          ).eq('id', av.id);
        } else {
          await sb.from('envois_quiz').insert({
            id, kind, item_id: it.id, item_titre: it.titre,
            civilite: d.civilite || null, prenom: d.prenom, nom: d.nom || null, email: d.email,
            creche: d.creche || null, statut: d.statut || null, source: d.source, ref,
            envoye_par: moi.id, etat: erreur ? 'echec' : 'envoye', erreur,
          });
        }
      };
      await noter(item, avant, idLigne);
      if (item2) {
        const { data: avant2 } = await sb.from('envois_quiz').select('id,ref,etat,nb_relances')
          .eq('kind', kind).eq('item_id', item2.id).ilike('email', d.email)
          .order('envoye_le', { ascending: false }).limit(1).maybeSingle();
        await noter(item2, avant2, avant2?.id || crypto.randomUUID());
      }
      res(erreur ? 'echec' : 'envoye', erreur || undefined);
    }
  } finally {
    try { await client.close(); } catch { /* ignoré */ }
  }
  return json({ ok: true, resultats });
});
