// ============================================================================
// Identification de l'appelant d'une edge function (service_role).
// ============================================================================
// « Verify JWT » ne suffit pas : la clé anon (publique dans le JS des pages)
// est elle aussi un JWT valide. Il faut donc retrouver la PERSONNE connectée :
//   1. le jeton est vérifié auprès de Supabase Auth (auth.getUser) ;
//   2. la fiche `referents` correspondante donne le rôle, l'organisation et la
//      crèche (même source que kk_mon_role / kk_mon_org / kk_ma_creche côté RLS).
//
// Utilisation :
//   const appelant = await identifierAppelant(sb, req);
//   if (!appelant) return json({ error: 'non_autorise' }, 401);
//   if (!peutGererCreche(appelant, creche)) return json({ error: 'interdit' }, 403);
// ============================================================================

// deno-lint-ignore no-explicit-any
type Client = any;

export type Appelant = {
  userId: string;
  role: 'direction' | 'referent' | 'employe' | string;
  orgId: string;
  crecheId: string | null;
};

export async function identifierAppelant(sb: Client, req: Request): Promise<Appelant | null> {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return null;
  const { data, error } = await sb.auth.getUser(jwt);
  // La clé anon passe ici sans erreur mais ne porte aucun utilisateur.
  if (error || !data?.user?.id) return null;
  const { data: ref } = await sb
    .from('referents')
    .select('role, org_id, creche_id')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (!ref?.org_id || !ref.role) return null;
  return { userId: data.user.id, role: ref.role, orgId: ref.org_id, crecheId: ref.creche_id ?? null };
}

/** Direction ou référent·e (les comptes « employe » de l'accès terrain n'ont aucun droit de gestion). */
export const estGestionnaire = (a: Appelant) => a.role === 'direction' || a.role === 'referent';

/**
 * Même règle que la fonction SQL kk_acces_creche_gestion : direction ou
 * référent·e, sur sa crèche ; sans crèche attitrée, sur toutes celles de son organisation.
 * La direction (kk_est_direction) garde l'ensemble de son organisation.
 */
export function peutGererCreche(
  a: Appelant,
  creche: { id: string; org_id: string | null } | null | undefined,
): boolean {
  if (!creche || creche.org_id !== a.orgId) return false;
  if (a.role === 'direction') return true;
  if (a.role !== 'referent') return false;
  return a.crecheId === null || a.crecheId === creche.id;
}

// ----------------------------------------------------------------------------
// Appels de serveur à serveur (cron GitHub Actions → fonctions → autres fonctions)
// ----------------------------------------------------------------------------
/** Vrai si l'appel porte la clé service_role (fonctions internes, ex. relances-devis-auto → notify-push). */
export function estServiceRole(req: Request): boolean {
  const cle = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return cle.length > 20 && jwt === cle;
}

/**
 * Comme peutGererCreche, mais ouvert aussi aux comptes « employe » (accès terrain)
 * sur LEUR crèche : saisie d'un incident, d'un registre de soins…
 */
export function appartientACreche(
  a: Appelant,
  creche: { id: string; org_id: string | null } | null | undefined,
): boolean {
  if (!creche || creche.org_id !== a.orgId) return false;
  if (a.role === 'direction') return true;
  return a.crecheId === null || a.crecheId === creche.id;
}

/** Crèche d'un enfant ({ id, org_id }) ou null. */
export async function crecheDeEnfant(sb: Client, enfantId: string | null | undefined) {
  if (!enfantId) return null;
  const { data: e } = await sb.from('enfants').select('creche_id').eq('id', enfantId).maybeSingle();
  return await crecheParId(sb, e?.creche_id);
}

/** Crèche par identifiant ({ id, org_id }) ou null. */
export async function crecheParId(sb: Client, crecheId: string | null | undefined) {
  if (!crecheId) return null;
  const { data: c } = await sb.from('creches').select('id, org_id').eq('id', crecheId).maybeSingle();
  return c ?? null;
}
