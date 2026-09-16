-- ============================================================================
-- 37i — Suivi de l'enfant : lecture depuis la tablette (grille d'accueil)
-- ============================================================================
-- Deux briques manquantes pour l'écran de saisie tablette :
--
--   1. La liste des enfants présents pour la crèche du token — la tablette
--      est en rôle `anon` (pas de session), donc pas d'accès direct à
--      `enfants` : il faut une fonction SECURITY DEFINER dédiée, comme
--      `kk_resolve_creche_id` pour la crèche seule. « Présent » = dernier
--      pointage du jour = 'arrivee' (source de vérité en temps réel, plutôt
--      que `presences` qui reste à 'present' toute la journée même après un
--      départ).
--
--   2. Le référentiel des repères (`suivi_jalons`) doit être lisible par la
--      tablette pour proposer les jalons filtrés par âge — son contenu
--      n'est pas une donnée d'enfant, juste des libellés pédagogiques
--      communs au réseau : on ouvre sa policy SELECT à `anon` en plus
--      d'`authenticated`, sans rien changer à l'écriture (toujours réservée
--      à la direction, cf. 37a).
-- ============================================================================

drop policy if exists suivi_jalons_select on public.suivi_jalons;
create policy suivi_jalons_select on public.suivi_jalons
  for select to anon, authenticated
  using (true);

grant select on public.suivi_jalons to anon;

create or replace function public.kk_suivi_kiosk_enfants_presents(p_token uuid)
returns table(
  id           uuid,
  prenom       text,
  nom          text,
  dob          date,
  allergies    text,
  regime_repas text,
  repas_base   text,
  gouter_base  text,
  groupe       text,
  pai_actif    boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device    public.kiosk_devices;
  v_creche_id uuid;
begin
  select * into v_device from public.kiosk_devices where token = p_token and active = true;
  if v_device is null then
    return;
  end if;
  v_creche_id := v_device.creche_id;

  return query
    with dernier as (
      select distinct on (p.enfant_id) p.enfant_id, p.action
      from public.pointages p
      where p.creche_id = v_creche_id
        and p.enfant_id is not null
        and p.horodatage::date = current_date
      order by p.enfant_id, p.horodatage desc
    )
    select
      e.id, e.prenom, e.nom, e.dob, e.allergies, e.regime_repas, e.repas_base, e.gouter_base, e.groupe,
      exists(select 1 from public.pai where pai.enfant_id = e.id and pai.actif) as pai_actif
    from public.enfants e
    join dernier d on d.enfant_id = e.id and d.action = 'arrivee'
    where e.creche_id = v_creche_id
    order by e.prenom;
end;
$$;

revoke all on function public.kk_suivi_kiosk_enfants_presents(uuid) from public;
grant execute on function public.kk_suivi_kiosk_enfants_presents(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Vérification
-- ----------------------------------------------------------------------------
select
  (select count(*) from pg_policies where schemaname='public' and tablename='suivi_jalons' and 'anon' = any(roles)) as jalons_policy_ouvre_anon,
  (select prosecdef from pg_proc where proname='kk_suivi_kiosk_enfants_presents' and pronamespace='public'::regnamespace) as fonction_ok;
