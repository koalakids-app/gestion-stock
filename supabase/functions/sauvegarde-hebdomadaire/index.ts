// ============================================================================
// supabase/functions/sauvegarde-hebdomadaire/index.ts
// Koala Kids — septembre 2026
//
// Sauvegarde hebdomadaire automatisée de toutes les tables Supabase
// (demandes, contrats, factures, employés, devis, familles, suivi,
// inscriptions, infirmerie, documents, etc.) : dump JSON compressé (gzip),
// envoyé par e-mail en pièce jointe. C'est ce dernier point qui rend la
// sauvegarde réellement "externe" — la donnée sort de Supabase vers une
// boîte mail choisie, pas seulement vers un autre coin du même projet.
//
// N'inclut PAS stock.html : cette appli stocke ses données uniquement dans
// le localStorage du navigateur (ARTICLES/COMMANDES/FOURNISSEURS/HISTORIQUE/
// UNIVERS ne sont jamais écrits en base), donc rien côté serveur ne permet
// de la sauvegarder automatiquement. Elle garde son bouton "Exporter
// sauvegarde" manuel comme seul moyen d'export.
//
// Déclenchement : GitHub Actions, cron hebdomadaire (voir
// .github/workflows/sauvegarde-hebdomadaire.yml), qui POSTe ici avec un
// secret partagé — pas le rôle "verify JWT" de Supabase, pour rester
// déclenchable depuis un simple curl planifié.
//
// VARIABLES D'ENVIRONNEMENT (à définir dans Supabase > Edge Functions >
// Secrets) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   déjà utilisées par les autres
//                                              fonctions de l'appli.
//   GMAIL_USER, GMAIL_APP_PASSWORD            idem (SMTP Gmail).
//   BACKUP_TRIGGER_SECRET                     jeton partagé avec le workflow
//                                              GitHub Actions (à générer,
//                                              ex. `openssl rand -hex 32`).
//   BACKUP_EMAIL_TO                           destinataire(s) de la sauvegarde,
//                                              séparés par des virgules.
//                                              Défaut : GMAIL_USER lui-même.
//
// DÉPLOIEMENT : depuis le tableau de bord, *Verify JWT* DÉSACTIVÉ (l'appel
// vient de GitHub Actions, pas d'un utilisateur connecté ; l'authentification
// se fait via BACKUP_TRIGGER_SECRET, vérifié ci-dessous).
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

// Toutes les tables de données métier de la suite Koala Kids, dans le
// projet Supabase principal. Hors périmètre volontairement :
//   - tables purement techniques (push_subscriptions, kiosk_devices,
//     signatures_pending) : rien à restaurer.
//   - "assets" : c'est un bucket de Storage (fichiers), pas une table.
//   - "module" / "quiz" (employes.html, collaborateur.html) : vivent dans
//     un second projet Supabase séparé (QUIZ_SUPABASE_URL), pas celui-ci —
//     à sauvegarder par une fonction dédiée si besoin un jour.
const TABLES = [
  'creches', 'etablissements', 'reseau_config',
  'demandes', 'referents', 'referents_lien_employe', 'referents_espace',
  'incidents', 'messages', 'actions_direction', 'reunions_direction', 'taches_afaire',
  'enfants', 'enfants_parents', 'enfants_contrats', 'enfants_documents_admin',
  'enfants_pai', 'pai', 'sante', 'vaccinations', 'vaccins_pj', 'registre_infirmerie',
  'preinscriptions', 'preinscriptions_parents', 'tarifs', 'tarifs_repas_config',
  'cmg_bareme', 'cmg_config',
  'contrats', 'contrats_lignes', 'devis', 'devis_lignes',
  'factures', 'factures_lignes', 'factures_reglements',
  'dossiers_familles', 'dossiers_pieces', 'documents_koala', 'documents_reponses',
  'doc_categories',
  'employes', 'planning', 'planning_alias', 'planning_equipe',
  'pointages', 'presences', 'lien_pointage_presence', 'remplacantes',
  'stagiaires', 'stagiaires_docs_types', 'stagiaires_documents', 'stagiaires_jours',
  'stagiaires_ressources', 'stagiaires_ressources_vues',
  'formations_envois',
  'suivi_jalons', 'suivi_saisies', 'suivi_observations', 'suivi_syntheses',
  'suivi_acces_famille',
  'frais_annexes', 'frais_ik_config', 'frais_ik_lignes', 'frais_pro',
  'commandes_repas', 'padlets',
  'reglementation_fiches', 'reglementation_veille',
  'rs_etablissement', 'rs_journal', 'rs_types_controle',
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

// Récupère toutes les lignes d'une table, par pages de 1000 (limite par
// défaut de PostgREST), pour ne rien tronquer même si une table grossit.
async function dumpTable(table: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from(table).select('*').range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return rows;
}

async function gzipBase64(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  // Conversion par blocs : passer un tableau d'octets entier à
  // String.fromCharCode via spread dépasse la limite d'arguments du
  // moteur JS dès quelques dizaines de milliers d'octets.
  let binaire = '';
  const chunk = 8192;
  for (let i = 0; i < compressed.length; i += chunk) {
    binaire += String.fromCharCode(...compressed.subarray(i, i + chunk));
  }
  return btoa(binaire);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  const secret = Deno.env.get('BACKUP_TRIGGER_SECRET');
  if (!secret || req.headers.get('x-backup-secret') !== secret) {
    return json({ erreur: 'Non autorisé' }, 401);
  }

  const dump: Record<string, unknown[]> = {};
  const erreurs: string[] = [];

  for (const table of TABLES) {
    try {
      dump[table] = await dumpTable(table);
    } catch (e) {
      // Une table absente ou en erreur ne doit pas empêcher la sauvegarde
      // du reste — on la signale et on continue.
      erreurs.push(String(e));
    }
  }

  const date = new Date().toISOString().split('T')[0];
  const payload = { version: '1.0', exportedAt: new Date().toISOString(), erreurs, tables: dump };

  let attachmentB64: string;
  try {
    attachmentB64 = await gzipBase64(JSON.stringify(payload));
  } catch (e) {
    return json({ erreur: `Échec de compression : ${e}` }, 500);
  }

  const user = Deno.env.get('GMAIL_USER');
  const pass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!user || !pass) {
    return json({ erreur: 'Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).' }, 500);
  }
  const destinataires = (Deno.env.get('BACKUP_EMAIL_TO') || user)
    .split(',').map((s) => s.trim()).filter(Boolean);

  const nbTables = Object.keys(dump).length;
  const nbLignes = Object.values(dump).reduce((n, rows) => n + rows.length, 0);
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.6">
    Sauvegarde hebdomadaire automatique de la base Koala Kids.<br>
    ${nbTables} tables, ${nbLignes} lignes au total.
    ${erreurs.length ? `<br><b style="color:#b00">${erreurs.length} table(s) en erreur (voir pièce jointe, champ "erreurs").</b>` : ''}
    <hr style="border:none;border-top:1px solid #E7E5E0;margin:20px 0">
    <div style="font-size:11px;color:#888">Envoyé automatiquement chaque semaine depuis l'application Koala Kids.</div>
  </div>`;

  const client = new SMTPClient({
    connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: user, password: pass } },
  });
  try {
    await client.send({
      from: user,
      to: destinataires,
      subject: `Sauvegarde Koala Kids - ${date}`,
      content: 'Ce message necessite un client de messagerie compatible HTML.',
      html,
      attachments: [
        { filename: `sauvegarde-koalakids-${date}.json.gz`, content: attachmentB64, encoding: 'base64' },
      ],
    });
  } catch (mailErr) {
    return json({ erreur: `Échec d'envoi e-mail : ${mailErr}` }, 502);
  } finally {
    // client.close() lève elle-même une erreur si send() a échoué avant
    // l'ouverture de la connexion (ex. destinataire invalide) — sans ce
    // try/catch, cette erreur secondaire écrase la réponse ci-dessus et la
    // fonction plante avec un 500 générique au lieu du message clair.
    try { await client.close(); } catch { /* connexion jamais ouverte */ }
  }

  return json({ ok: true, tables: nbTables, lignes: nbLignes, erreurs }, 200);
});
