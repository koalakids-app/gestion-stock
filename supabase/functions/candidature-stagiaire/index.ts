// ============================================================================
// supabase/functions/candidature-stagiaire/index.ts
// Koala Kids — novembre 2026
//
// La porte d'entrée de candidature-stage.html : le « Padlet » interne où une
// personne qui cherche un stage ou une alternance dépose sa demande, sans
// compte. La demande est publiée dans le MUR DES CANDIDATURES (Demandes ›
// Stagiaires › Candidatures, table `stagiaires_candidatures`) avec son CV et sa
// lettre : les référent·e·s se positionnent, la direction attribue.
//
// Deux actions, en POST { action, ... } :
//   - "config"  : marque de l'organisation et liste des crèches ;
//   - "envoyer" : crée la candidature (statut ouverte), dépose CV et lettre dans
//                 le bucket privé `stagiaires-vivier` (base64, 5 Mo max chacun) et
//                 prévient direction et référent·e·s par notification.
//
// Rien n'est lu en base côté public : la page ne reçoit que la liste des
// crèches. Écriture en service_role, donc tout est revalidé ici :
//   - champs bornés, e-mail valide, type en liste fermée, dates cohérentes ;
//   - crèche souhaitée facultative : simple indication dans la note ;
//   - fichiers : PDF, image ou Word, taille et type contrôlés ;
//   - champ piège « site_web » et plafonds (même adresse / jour, total / heure).
//
// DÉPLOIEMENT — pas de JWT :
//   supabase functions deploy candidature-stagiaire --no-verify-jwt
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const MAX_PAR_ADRESSE_ET_JOUR = 2;
const MAX_PAR_HEURE = 30;

class Refus extends Error {
  constructor(message: string, public statut = 400) { super(message); }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TEL = /^[0-9 +().-]{6,20}$/;

const txt = (v: unknown, max = 200) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '';

async function orgParDefaut(): Promise<string | null> {
  const { data } = await sb.from('organisations').select('id').order('created_at').limit(1).maybeSingle();
  return data?.id ?? null;
}

async function action_config() {
  const orgId = await orgParDefaut();
  if (!orgId) throw new Refus('Organisation introuvable', 404);
  const [{ data: org }, { data: creches }] = await Promise.all([
    sb.from('organisations').select('nom,logo_url').eq('id', orgId).maybeSingle(),
    sb.from('creches').select('id,name').eq('org_id', orgId).order('name'),
  ]);
  return {
    org: { nom: org?.nom || 'Koala Kids', logo_url: org?.logo_url || null },
    creches: (creches || []).map((c: any) => ({ id: c.id, nom: c.name })),
  };
}

async function prevenir(orgId: string | null, prenom: string, nom: string, profil: string) {
  try {
    if (!orgId) return;
    const { data: refs } = await sb.from('referents').select('id').in('role', ['referent', 'direction']).eq('org_id', orgId);
    const ids = (refs ?? []).map((r: any) => r.id);
    if (!ids.length) return;
    const url = Deno.env.get('SUPABASE_URL')!;
    const cle = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    await fetch(`${url}/functions/v1/notify-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cle}`, apikey: cle },
      body: JSON.stringify({
        referent_ids: ids,
        title: profil === 'alternant' ? 'Nouvelle candidature d\'alternance' : 'Nouvelle candidature de stage',
        body: `${prenom} ${nom}`.trim(),
        url: './demandes.html',
        tag: 'candidature-stagiaire',
      }),
    });
  } catch (e) {
    console.error('[candidature-stagiaire] notification', e);
  }
}

// Fichiers acceptés : 5 Mo chacun (envoyés en base64 dans la requête).
const TAILLE_MAX = 5 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
type Fichier = { nom: string; mime: string; octets: Uint8Array };

function lireFichier(f: any, libelle: string): Fichier | null {
  if (!f || !f.base64) return null;
  const mime = txt(f.mime, 100);
  if (!TYPES[mime]) throw new Refus(`${libelle} : format non accepté (PDF, image ou Word).`);
  let octets: Uint8Array;
  try {
    octets = Uint8Array.from(atob(String(f.base64)), (c) => c.charCodeAt(0));
  } catch { throw new Refus(`${libelle} : fichier illisible.`); }
  if (!octets.length) return null;
  if (octets.length > TAILLE_MAX) throw new Refus(`${libelle} : fichier trop lourd (5 Mo maximum).`);
  return { nom: txt(f.nom, 150) || libelle, mime, octets };
}

async function action_envoyer(p: any) {
  // Champ piège : un robot le remplit. Réponse « ok » pour ne rien lui apprendre.
  if (txt(p.site_web, 50)) return { ok: true };

  const prenom = txt(p.prenom, 80), nom = txt(p.nom, 80);
  const email = txt(p.email, 160).toLowerCase(), tel = txt(p.telephone, 25);
  if (!prenom || !nom) throw new Refus('Indiquez votre prénom et votre nom.');
  if (!MAIL.test(email)) throw new Refus('Indiquez une adresse e-mail valide : c\'est ainsi que la crèche vous répondra.');
  if (tel && !TEL.test(tel)) throw new Refus('Le numéro de téléphone semble incorrect.');
  if (p.accord !== true) throw new Refus('Cochez la case d\'accord pour que votre demande soit enregistrée.');

  const type = p.type === 'alternant' ? 'alternant' : 'stagiaire';
  const ecole = txt(p.ecole, 160), formation = txt(p.formation, 160), niveau = txt(p.niveau, 80);
  if (!ecole || !formation) throw new Refus('Indiquez votre école ou organisme et votre formation.');
  const debut = txt(p.date_debut, 10), fin = txt(p.date_fin, 10);
  if (debut && !DATE.test(debut)) throw new Refus('Date de début incorrecte.');
  if (fin && !DATE.test(fin)) throw new Refus('Date de fin incorrecte.');
  if (debut && fin && fin < debut) throw new Refus('La fin souhaitée est avant le début.');
  const message = txt(p.message, 1500);
  const cv = lireFichier(p.cv, 'CV');
  const lettre = lireFichier(p.lettre, 'Lettre de motivation');

  let crecheNom = '';
  let orgId: string | null = null;
  if (p.creche_id) {
    if (!UUID.test(p.creche_id)) throw new Refus('Crèche inconnue.');
    const { data: c } = await sb.from('creches').select('name,org_id').eq('id', p.creche_id).maybeSingle();
    if (!c) throw new Refus('Crèche inconnue.');
    crecheNom = c.name || ''; orgId = c.org_id ?? null;
  }
  if (!orgId) orgId = await orgParDefaut();
  if (!orgId) throw new Refus('Organisation introuvable', 404);

  // Plafonds anti-spam : même adresse sur 24 h, total sur 1 h.
  const il24 = new Date(Date.now() - 24 * 3600e3).toISOString();
  const il1 = new Date(Date.now() - 3600e3).toISOString();
  const [{ count: memeMail }, { count: total }] = await Promise.all([
    sb.from('stagiaires_candidatures').select('id', { count: 'exact', head: true }).ilike('email', email).gte('created_at', il24),
    sb.from('stagiaires_candidatures').select('id', { count: 'exact', head: true }).gte('created_at', il1),
  ]);
  if ((memeMail ?? 0) >= MAX_PAR_ADRESSE_ET_JOUR) {
    throw new Refus('Votre demande a déjà été reçue : la crèche vous répondra par e-mail.', 429);
  }
  if ((total ?? 0) >= MAX_PAR_HEURE) throw new Refus('Trop de demandes en ce moment, réessayez plus tard.', 429);

  const notes = [
    crecheNom ? `Crèche souhaitée : ${crecheNom}.` : '',
    message ? `Message : ${message}` : '',
    'Reçue par le formulaire en ligne.',
  ].filter(Boolean).join('\n');

  const { data: cand, error } = await sb.from('stagiaires_candidatures').insert({
    org_id: orgId, type_contrat: type, prenom, nom, email, telephone: tel || null,
    ecole, formation, niveau: niveau || null,
    date_debut: debut || null, date_fin: fin || null, notes,
    created_by: 'Formulaire en ligne',
  }).select('id').single();
  if (error || !cand) { console.error('[candidature-stagiaire] insertion', error); throw new Error('insertion'); }

  // Les fichiers : si un dépôt échoue, la candidature est retirée (rien d'à moitié publié).
  const maj: Record<string, unknown> = {};
  const deposes: string[] = [];
  try {
    for (const [cle, f] of [['cv', cv], ['lettre', lettre]] as [string, Fichier | null][]) {
      if (!f) continue;
      const chemin = `${cand.id}/${cle}-${Date.now()}.${TYPES[f.mime]}`;
      const { error: ue } = await sb.storage.from('stagiaires-vivier').upload(chemin, f.octets, { contentType: f.mime });
      if (ue) throw ue;
      deposes.push(chemin);
      maj[`${cle}_path`] = chemin; maj[`${cle}_nom`] = f.nom; maj[`${cle}_mime`] = f.mime;
    }
    if (Object.keys(maj).length) {
      const { error: me } = await sb.from('stagiaires_candidatures').update(maj).eq('id', cand.id);
      if (me) throw me;
    }
  } catch (e) {
    console.error('[candidature-stagiaire] fichiers', e);
    if (deposes.length) await sb.storage.from('stagiaires-vivier').remove(deposes);
    await sb.from('stagiaires_candidatures').delete().eq('id', cand.id);
    throw new Error('fichiers');
  }

  await prevenir(orgId, prenom, nom, type);
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);
  try {
    const p = await req.json();
    switch (p?.action) {
      case 'config': return json(await action_config());
      case 'envoyer': return json(await action_envoyer(p));
      default: return json({ erreur: 'Action inconnue' }, 400);
    }
  } catch (e) {
    if (e instanceof Refus) return json({ erreur: e.message }, e.statut);
    console.error('[candidature-stagiaire]', e);
    return json({ erreur: 'Erreur serveur' }, 500);
  }
});
