// ============================================================================
// supabase/functions/preinscription-publique/index.ts
// Koala Kids — octobre 2026
//
// La porte d'entrée de preinscription.html, le formulaire que les familles
// remplissent sans compte (lien sur le site internet ou envoyé depuis l'appli).
//
// Trois actions, toutes en POST { action, ... } :
//   - "config"   : la marque de l'organisation et la liste de ses crèches ;
//   - "estimer"  : chiffre l'accueil demandé, sans rien écrire ;
//   - "envoyer"  : crée la fiche famille (preinscriptions + parents), le devis
//                  en brouillon (devis + devis_lignes), puis prévient la
//                  famille et la direction par e-mail.
//
// La fonction s'exécute en service_role. Elle ne fait donc confiance à rien de
// ce que le navigateur envoie, sauf aux saisies de la famille elles-mêmes :
//   - la crèche doit exister, l'organisation en est déduite côté serveur ;
//   - le tarif et les frais sont relus en base, jamais reçus ;
//   - le devis reste en BROUILLON : c'est la direction qui le relit puis
//     l'envoie, comme pour toute demande. La famille ne reçoit qu'une
//     estimation, clairement présentée comme telle ;
//   - un champ piège (« site_web ») et des plafonds d'envois limitent le spam.
//
// DÉPLOIEMENT — la famille n'a pas de compte, donc pas de JWT :
//   supabase functions deploy preinscription-publique --no-verify-jwt
//
// VARIABLES D'ENVIRONNEMENT (déjà posées pour envoyer-devis) :
//   GMAIL_USER, GMAIL_APP_PASSWORD, APP_URL
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

const SOURCE = 'Formulaire en ligne';
// Plafonds anti-spam. Une crèche reçoit au pire quelques demandes par jour :
// ces seuils ne gênent aucune famille et arrêtent un script.
const MAX_PAR_HEURE_ET_CRECHE = 20;
const MAX_PAR_ADRESSE_ET_JOUR = 3;

class Refus extends Error {
  constructor(message: string, public statut = 400) { super(message); }
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const eur = (n: unknown) => {
  const v = Math.round(Number(n || 0) * 100) / 100;
  const [ent, dec] = Math.abs(v).toFixed(2).replace('.', ',').split(',');
  return (v < 0 ? '- ' : '') + ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + dec + ' €';
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Texte saisi : rogné, sans retour à la ligne parasite, borné. */
const txt = (v: unknown, max = 200) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '';

// ---------------------------------------------------------------------------
// Organisation et crèches
// ---------------------------------------------------------------------------

async function orgDe(p: { creche_id?: string; org?: string }) {
  if (p.creche_id && UUID.test(p.creche_id)) {
    const { data: c } = await sb.from('creches').select('org_id').eq('id', p.creche_id).maybeSingle();
    if (c?.org_id) return c.org_id as string;
  }
  if (p.org) {
    const { data } = await sb.from('organisations').select('id').eq('slug', txt(p.org, 80)).maybeSingle();
    if (data) return data.id as string;
  }
  const { data } = await sb.from('organisations').select('id').order('created_at').limit(1).maybeSingle();
  if (!data) throw new Refus('Organisation introuvable', 404);
  return data.id as string;
}

async function action_config(p: any) {
  const orgId = await orgDe(p);
  const [{ data: org }, { data: creches }] = await Promise.all([
    sb.from('organisations').select('nom,logo_url,couleur_primaire,couleur_secondaire').eq('id', orgId).maybeSingle(),
    sb.from('creches').select('id,name,addr').eq('org_id', orgId).order('name'),
  ]);
  return {
    org: {
      nom: org?.nom || 'Koala Kids',
      logo_url: org?.logo_url || null,
      couleur: org?.couleur_primaire || null,
    },
    creches: (creches || []).map((c: any) => ({ id: c.id, nom: c.name, adresse: c.addr || '' })),
  };
}

// ---------------------------------------------------------------------------
// Le chiffrage — même règle que inscriptions.html (dCalcule / tarifPour)
// ---------------------------------------------------------------------------

type Saisie = {
  creche_id: string; jours: number[]; heure_debut: string; heure_fin: string;
  date_entree: string | null; revenus: number | null; isole: boolean; dob: string | null;
};

function lireAccueil(p: any): Saisie {
  if (!UUID.test(p.creche_id || '')) throw new Refus('Choisissez une crèche.');
  const jours = [...new Set((Array.isArray(p.jours) ? p.jours : []).map(Number))]
    .filter((j: any) => Number.isInteger(j) && j >= 1 && j <= 5).sort() as number[];
  if (!jours.length) throw new Refus('Choisissez au moins un jour d\'accueil.');
  const hd = txt(p.heure_debut, 5), hf = txt(p.heure_fin, 5);
  if (!HEURE.test(hd) || !HEURE.test(hf) || hf <= hd) {
    throw new Refus('Les horaires sont incohérents : l\'arrivée doit précéder le départ.');
  }
  const date = txt(p.date_entree, 10);
  const dob = txt(p.dob, 10);
  const rev = p.revenus === '' || p.revenus == null ? null : Number(p.revenus);
  return {
    creche_id: p.creche_id, jours, heure_debut: hd, heure_fin: hf,
    date_entree: DATE.test(date) ? date : null,
    revenus: rev != null && isFinite(rev) && rev >= 0 && rev < 10_000_000 ? Math.round(rev) : null,
    isole: !!p.isole,
    dob: DATE.test(dob) ? dob : null,
  };
}

const ageAns = (dob: string | null, ref: string | null) => {
  if (!dob || !ref) return null;
  const d0 = new Date(dob + 'T00:00:00'), d1 = new Date(ref + 'T00:00:00');
  if (isNaN(+d0) || isNaN(+d1)) return null;
  let a = d1.getFullYear() - d0.getFullYear();
  const m = d1.getMonth() - d0.getMonth();
  if (m < 0 || (m === 0 && d1.getDate() < d0.getDate())) a--;
  return Math.max(0, a);
};

function tarifPour(tarifs: any[], h: number, crecheId: string) {
  const bornes = (t: any) => (t.heures_min == null ? 0 : 1) + (t.heures_max == null ? 0 : 1);
  const largeur = (t: any) =>
    (t.heures_max == null ? Infinity : Number(t.heures_max)) - (t.heures_min == null ? 0 : Number(t.heures_min));
  return tarifs
    .filter(t => t.actif)
    .filter(t => !t.creche_id || String(t.creche_id) === String(crecheId))
    .filter(t => (t.heures_min == null || h >= Number(t.heures_min)) && (t.heures_max == null || h < Number(t.heures_max)))
    .sort((a, b) => (a.creche_id ? 0 : 1) - (b.creche_id ? 0 : 1)
      || bornes(b) - bornes(a) || largeur(a) - largeur(b) || (a.ordre ?? 0) - (b.ordre ?? 0))[0] || null;
}

async function chiffrer(s: Saisie) {
  const { data: creche } = await sb.from('creches').select('id,name,org_id').eq('id', s.creche_id).maybeSingle();
  if (!creche) throw new Refus('Crèche introuvable.', 404);

  const [{ data: tarifs }, { data: frais }, { data: etab }, { data: bareme }, { data: cfg }] = await Promise.all([
    sb.from('tarifs').select('*').eq('org_id', creche.org_id),
    sb.from('frais_annexes').select('*').eq('org_id', creche.org_id).eq('actif', true).eq('par_defaut', true).order('ordre'),
    sb.from('etablissements').select('semaines_facturees,email').eq('creche_id', creche.id).maybeSingle(),
    sb.from('cmg_bareme').select('*').eq('actif', true),
    sb.from('cmg_config').select('config').eq('org_id', creche.org_id).maybeSingle(),
  ]);

  const nj = s.jours.length;
  const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const h = r2((mins(s.heure_fin) - mins(s.heure_debut)) / 60 * nj);
  const sem = etab?.semaines_facturees != null ? Number(etab.semaines_facturees) : 47;
  const jparmois = nj * sem / 12;
  const hparjour = h / nj;

  const lignes: any[] = [];
  const tarif = tarifPour(tarifs || [], h, creche.id);
  if (tarif) {
    let q: number, tot: number;
    const pu = Number(tarif.montant);
    if (tarif.mode === 'horaire') { q = jparmois * hparjour; tot = q * pu; }
    else if (tarif.mode === 'journee') { q = jparmois; tot = q * pu; }
    else { q = 1; tot = pu; }
    lignes.push({
      libelle: tarif.libelle, description: tarif.description || '', type: 'accueil',
      quantite: Math.round(q * 1000) / 1000, montant_unitaire: pu, total: r2(tot),
    });
  }
  for (const f of (frais || []).filter((x: any) => !x.creche_id || x.creche_id === creche.id)) {
    const signe = f.est_reduction ? -1 : 1;
    const q = f.type === 'unitaire' ? jparmois : 1;
    lignes.push({
      libelle: f.libelle, description: f.description || '', type: f.type,
      quantite: Math.round(q * 1000) / 1000, montant_unitaire: signe * Number(f.montant),
      total: r2(signe * Number(f.montant) * q),
    });
  }
  if (!lignes.length) throw new Refus('Aucun tarif n\'est paramétré pour cette crèche.', 409);

  const recur = ['accueil', 'mensuel', 'unitaire'];
  const mensuel = r2(lignes.filter(l => recur.includes(l.type)).reduce((a, l) => a + l.total, 0));
  const uniques = r2(lignes.filter(l => l.type === 'unique').reduce((a, l) => a + l.total, 0));
  const annuels = r2(lignes.filter(l => l.type === 'annuel').reduce((a, l) => a + l.total, 0));

  // CMG : estimation indicative, seulement si les éléments sont connus.
  let cmg: number | null = null, reste: number | null = null;
  const age = ageAns(s.dob, s.date_entree || new Date().toISOString().slice(0, 10));
  if (s.revenus != null && age != null && age < 6 && bareme?.length) {
    const sit = s.isole ? 'isole' : 'couple';
    const tr = bareme.filter((b: any) => b.situation === sit)
      .sort((a: any, b: any) => (a.revenu_max == null ? 1 : 0) - (b.revenu_max == null ? 1 : 0) || Number(a.revenu_max) - Number(b.revenu_max))
      .find((b: any) => b.revenu_max == null || s.revenus! <= Number(b.revenu_max));
    if (tr) {
      const c = cfg?.config || {};
      const ratio = age >= 3 ? Number(c.ratio_3_6 ?? 0.5) : 1;
      const plafondBareme = r2(Number(tr.montant) * ratio);
      const plafondCout = r2(mensuel * Number(c.taux_max ?? 0.85));
      const aide = (tarif?.mode === 'horaire' && Number(tarif.montant) > Number(c.plafond_horaire ?? 10)) ? 0
        : r2(Math.min(plafondBareme, plafondCout));
      cmg = aide; reste = r2(mensuel - aide);
    }
  }

  return {
    creche, etab, tarif, lignes, h, sem, mensuel, uniques,
    annuel: r2(mensuel * 12 + annuels), cmg, reste,
  };
}

async function action_estimer(p: any) {
  const c = await chiffrer(lireAccueil(p));
  return {
    heures_hebdo: c.h, mensuel: c.mensuel, frais_uniques: c.uniques, cmg: c.cmg, reste: c.reste,
    // Le libellé de la tranche tarifaire est un repère interne : la famille
    // voit « Frais de garde » (comme sur devis.html).
    lignes: c.lignes.map(l => ({
      libelle: l.type === 'accueil' ? 'Frais de garde' : l.libelle,
      type: l.type, total: l.total,
    })),
  };
}

// ---------------------------------------------------------------------------
// E-mails
// ---------------------------------------------------------------------------

function encodeSubject(subject: string): string {
  const s = subject.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[—–]/g, '-')
    .replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').replace(/^[=\s]+/, '').trim();
  return s || 'Notification';
}

async function sendEmail(to: string[], subject: string, html: string, orgNom: string) {
  const user = Deno.env.get('GMAIL_USER'), pass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!user || !pass) throw new Error('Configuration Gmail manquante');
  const client = new SMTPClient({
    connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: user, password: pass } },
  });
  try {
    await client.send({
      from: `${orgNom} <${user}>`, to, subject: encodeSubject(subject),
      content: 'Ce message nécessite un client de messagerie compatible HTML.', html,
    });
  } finally { await client.close(); }
}

const enveloppe = (orgNom: string, logo: string, titre: string, corps: string) =>
  `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F6FC;padding:24px 12px;
  font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2740;line-height:1.6">
  <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E3E1EF">
    <div style="padding:20px 24px;text-align:center"><img src="${esc(logo)}" alt="${esc(orgNom)}" width="220" style="display:inline-block;height:auto"></div>
    <div style="background:#3D3580;color:#fff;padding:18px 24px;font-size:20px;font-weight:700">${esc(titre)}</div>
    <div style="padding:24px">${corps}</div></div></body></html>`;

function tableauDevis(c: { lignes: any[]; mensuel: number; cmg: number | null; reste: number | null }) {
  const tr = (a: string, b: string, style = '') =>
    `<tr><td style="padding:5px 0;font-size:15px;${style}">${a}</td><td style="padding:5px 0;font-size:15px;text-align:right;font-weight:700;white-space:nowrap;${style}">${b}</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 18px;border-top:1px solid #E3E1EF;border-bottom:1px solid #E3E1EF">`
    + c.lignes.map(l => tr(esc(l.type === 'accueil' ? 'Frais de garde' : l.libelle), eur(l.total))).join('')
    + tr('<b>Mensualité estimée</b>', eur(c.mensuel))
    + (c.reste != null
      ? tr('CMG estimé', '− ' + eur(c.cmg), 'color:#2E9E6B') + tr('<b>Reste à charge estimé</b>', eur(c.reste))
      : '')
    + `</table>`;
}

// ---------------------------------------------------------------------------
// Envoi du formulaire
// ---------------------------------------------------------------------------

async function action_envoyer(p: any) {
  // Champ piège : invisible pour une personne, rempli par la plupart des
  // robots. On répond « ok » sans rien écrire, pour ne pas leur apprendre.
  if (txt(p.site_web)) return { ok: true };

  const s = lireAccueil(p);
  const e = p.enfant || {}, f = p.foyer || {};
  const prenom = txt(e.prenom, 80), nom = txt(e.nom, 80);
  if (!prenom || !nom) throw new Refus('Indiquez le prénom et le nom de l\'enfant.');
  const aNaitre = e.ne_ou_a_naitre === 'a_naitre';
  if (!s.dob) throw new Refus(aNaitre ? 'Indiquez le terme prévu.' : 'Indiquez la date de naissance de l\'enfant.');
  const auj = new Date().toISOString().slice(0, 10);
  const max = new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10);
  if (aNaitre ? (s.dob < auj || s.dob > max) : (s.dob > auj || s.dob < '2015-01-01')) {
    throw new Refus('La date de naissance de l\'enfant semble incorrecte.');
  }
  if (!p.consentement) throw new Refus('Le consentement est nécessaire pour traiter votre demande.');

  const liens = ['mere', 'pere', 'tuteur', 'autre'];
  const parents = (Array.isArray(p.parents) ? p.parents : []).slice(0, 2).map((x: any) => ({
    lien: liens.includes(x?.lien) ? x.lien : 'autre',
    prenom: txt(x?.prenom, 80), nom: txt(x?.nom, 80),
    email: txt(x?.email, 160).toLowerCase(), telephone: txt(x?.telephone, 30), profession: txt(x?.profession, 120),
  })).filter((x: any) => x.prenom || x.nom || x.email || x.telephone);
  const p1 = parents[0];
  if (!p1 || !p1.prenom || !p1.nom) throw new Refus('Indiquez le prénom et le nom du premier parent.');
  if (!MAIL.test(p1.email)) throw new Refus('Indiquez une adresse e-mail valide pour le premier parent.');
  if (p1.telephone.replace(/\D/g, '').length < 9) throw new Refus('Indiquez un numéro de téléphone valide.');
  for (const x of parents) if (x.email && !MAIL.test(x.email)) throw new Refus('Une adresse e-mail est incorrecte.');

  const c = await chiffrer(s);

  // Plafonds d'envois.
  const depuisH = new Date(Date.now() - 3600_000).toISOString();
  const depuisJ = new Date(Date.now() - 86400_000).toISOString();
  const { count: nbCreche } = await sb.from('preinscriptions').select('id', { count: 'exact', head: true })
    .eq('source', SOURCE).eq('creche_id', c.creche.id).gte('created_at', depuisH);
  if ((nbCreche || 0) >= MAX_PAR_HEURE_ET_CRECHE) {
    throw new Refus('Beaucoup de demandes arrivent en ce moment. Réessayez dans un moment.', 429);
  }
  const mails = parents.map((x: any) => x.email).filter(Boolean);
  if (mails.length) {
    const { data: recents } = await sb.from('preinscriptions_parents').select('preinscription_id')
      .in('email', mails).gte('created_at', depuisJ);
    if ((recents?.length || 0) >= MAX_PAR_ADRESSE_ET_JOUR) {
      throw new Refus('Une demande a déjà été reçue avec cette adresse. Nous vous recontactons très vite.', 429);
    }
  }

  // 1. La fiche famille.
  const { data: pre, error: ePre } = await sb.from('preinscriptions').insert({
    statut: 'nouvelle', source: SOURCE,
    comment_connus: txt(p.comment_connus, 200),
    notes_internes: txt(p.message, 1500) ? 'Message de la famille : ' + txt(p.message, 1500) : '',
    prenom, nom, sexe: e.sexe === 'F' || e.sexe === 'M' ? e.sexe : null,
    ne_ou_a_naitre: aNaitre ? 'a_naitre' : 'ne', dob: s.dob,
    allergies: txt(e.allergies, 300), pai: !!e.pai, pai_detail: e.pai ? txt(e.pai_detail, 300) : '',
    fratrie_reseau: !!e.fratrie,
    adresse: txt(f.adresse, 200), code_postal: txt(f.code_postal, 10), ville: txt(f.ville, 80),
    num_allocataire: txt(f.num_allocataire, 30),
    parents_separes: !!f.separes, garde_alternee: !!f.alternee,
    revenus_foyer: s.revenus, majoration_paje: s.isole,
    cmg_estime: c.cmg,
    creches_souhaitees: [c.creche.id], creche_id: c.creche.id,
    date_entree_souhaitee: s.date_entree, jours: s.jours,
    heure_debut: s.heure_debut, heure_fin: s.heure_fin,
  }).select('id').single();
  if (ePre || !pre) { console.error('[preinscription] fiche', ePre); throw new Refus('Enregistrement impossible. Réessayez dans un instant.', 500); }

  // 2. Les parents. En cas d'échec, on ne laisse pas une fiche orpheline.
  const { error: ePar } = await sb.from('preinscriptions_parents').insert(parents.map((x: any) => ({
    preinscription_id: pre.id, lien: x.lien, prenom: x.prenom, nom: x.nom, email: x.email,
    telephone: x.telephone, profession: x.profession, destinataire: !!x.email,
  })));
  if (ePar) {
    console.error('[preinscription] parents', ePar);
    await sb.from('preinscriptions').delete().eq('id', pre.id);
    throw new Refus('Enregistrement impossible. Réessayez dans un instant.', 500);
  }

  // 3. Le devis, en brouillon. Un échec ici ne perd pas la demande : la
  //    direction peut toujours le créer à la main depuis la fiche.
  let numero: string | null = null;
  try {
    const { data: dv, error: eDv } = await sb.from('devis').insert({
      preinscription_id: pre.id, statut: 'brouillon', creche_id: c.creche.id,
      date_debut: s.date_entree, jours: s.jours,
      heure_debut: s.heure_debut, heure_fin: s.heure_fin, heures_hebdo: c.h, semaines_an: c.sem,
      tarif_id: c.tarif?.id ?? null, tarif_libelle: c.tarif?.libelle ?? '',
      tarif_mode: c.tarif?.mode ?? 'horaire', tarif_montant: c.tarif ? Number(c.tarif.montant) : 0,
      total_mensuel: c.mensuel, total_annuel: c.annuel, frais_uniques: c.uniques,
      cmg_estime: c.cmg, reste_a_charge: c.reste,
      destinataires: mails.join(', '),
      commentaire: '', notes_internes: 'Devis généré automatiquement par le formulaire de préinscription. À relire avant envoi.',
    }).select('id,numero').single();
    if (eDv || !dv) throw eDv || new Error('devis vide');
    numero = dv.numero;
    const { error: eL } = await sb.from('devis_lignes').insert(c.lignes.map((l, i) => ({
      devis_id: dv.id, libelle: l.libelle, description: l.description, type: l.type,
      quantite: l.quantite, montant_unitaire: l.montant_unitaire, total: l.total, ordre: (i + 1) * 10,
    })));
    if (eL) throw eL;
  } catch (err) {
    console.error('[preinscription] devis', err);
  }

  // 4. E-mails : meilleur effort, la demande est déjà enregistrée.
  const { data: org } = await sb.from('organisations').select('nom,logo_url,app_url').eq('id', c.creche.org_id).maybeSingle();
  const orgNom = org?.nom || 'Koala Kids';
  const logo = org?.logo_url || 'https://koalakids-app.github.io/gestion-stock/logo-koalakids.png';
  const base = (Deno.env.get('APP_URL') || org?.app_url || '').replace(/[^/]*\.html?(\?.*)?$/i, '').replace(/\/*$/, '/');
  const enfantNom = `${prenom} ${nom}`;
  const semaine = s.jours.map(j => ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'][j]).join(', ');

  if (Deno.env.get('GMAIL_USER') && Deno.env.get('GMAIL_APP_PASSWORD')) {
    const aFamille = sendEmail(mails, `Votre demande de préinscription - ${prenom}`, enveloppe(orgNom, logo,
      'Nous avons bien reçu votre demande',
      `<p style="margin:0 0 14px;font-size:15px">Bonjour ${esc(p1.prenom)},</p>
       <p style="margin:0 0 14px;font-size:15px">Merci : la demande de préinscription de <b>${esc(enfantNom)}</b> à la micro-crèche
       <b>${esc(c.creche.name)}</b> est bien enregistrée. La directrice vous recontacte très vite pour vous proposer une visite.</p>
       <p style="margin:0 0 8px;font-size:15px">Accueil souhaité : ${esc(semaine)}, de ${esc(s.heure_debut)} à ${esc(s.heure_fin)}.
       Voici une <b>estimation</b> de la facturation mensuelle :</p>${tableauDevis(c)}
       <p style="margin:0;font-size:13px;color:#78748C">Estimation indicative, non contractuelle. Le devis définitif vous sera envoyé par la direction. Le CMG est calculé par la CAF, seule habilitée à en fixer le montant.</p>`
    ), orgNom).catch(err => console.error('[preinscription] mail famille', err));

    const dest = txt(c.etab?.email, 160);
    const aDirection = dest && MAIL.test(dest)
      ? sendEmail([dest], `Nouvelle préinscription - ${prenom} ${nom}`, enveloppe(orgNom, logo,
        'Nouvelle préinscription en ligne',
        `<p style="margin:0 0 12px;font-size:15px"><b>${esc(enfantNom)}</b> (${esc(c.creche.name)}) vient d'être préinscrit(e) via le formulaire en ligne.</p>
         <p style="margin:0 0 12px;font-size:15px">Contact : ${esc(p1.prenom)} ${esc(p1.nom)} — ${esc(p1.telephone)} — ${esc(p1.email)}</p>
         <p style="margin:0 0 12px;font-size:15px">La fiche famille est créée${numero ? ` et le devis <b>${esc(numero)}</b> est prêt en brouillon (${esc(eur(c.mensuel))} / mois)` : ''}.</p>
         ${base ? `<p style="margin:0;text-align:center"><a href="${esc(base)}inscriptions.html" style="display:inline-block;background:#F47920;color:#fff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:11px">Ouvrir les demandes</a></p>` : ''}`
      ), orgNom).catch(err => console.error('[preinscription] mail direction', err))
      : Promise.resolve();
    await Promise.all([mails.length ? aFamille : Promise.resolve(), aDirection]);
  }

  return {
    ok: true,
    estimation: {
      mensuel: c.mensuel, cmg: c.cmg, reste: c.reste,
      lignes: c.lignes.map(l => ({ libelle: l.type === 'accueil' ? 'Frais de garde' : l.libelle, type: l.type, total: l.total })),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);
  try {
    const p = await req.json();
    switch (p?.action) {
      case 'config': return json(await action_config(p));
      case 'estimer': return json(await action_estimer(p));
      case 'envoyer': return json(await action_envoyer(p));
      default: return json({ erreur: 'Action inconnue' }, 400);
    }
  } catch (e) {
    if (e instanceof Refus) return json({ erreur: e.message }, e.statut);
    console.error('[preinscription-publique]', e);
    return json({ erreur: 'Erreur serveur' }, 500);
  }
});
