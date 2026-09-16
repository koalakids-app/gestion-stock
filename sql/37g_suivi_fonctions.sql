-- ============================================================================
-- 37g — Suivi de l'enfant : fonctions (kiosque, publication)
-- ============================================================================
-- Trois familles de fonctions, toutes SECURITY DEFINER :
--   1. Saisie tablette par code (réutilise kiosk_devices/code_pointage/
--      kiosk_login_attempts déjà en place pour les pointages, cf.
--      kiosque_code_pointage.sql — aucun nouveau système de PIN).
--   2. Verrouillage à 24 h : PAS de fonction dédiée. Comme
--      registre_infirmerie.autoLock() côté client, un simple
--      `update ... set locked_at=now() where locked_at is null and ...`
--      suffit, la policy UPDATE de 37b/37c l'autorise déjà pour une
--      personne authentifiée de la bonne crèche.
--   3. Publication bloquante : trigger BEFORE UPDATE sur suivi_syntheses,
--      appliqué côté serveur quel que soit l'appelant (interface ou non).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Dernier jour d'accueil réellement présent dans une période (utilisé
--    pour la publication semaine/mois/année : on regarde le départ du
--    dernier jour où l'enfant était effectivement là, pas la date de fin
--    calendaire de la période).
-- ----------------------------------------------------------------------------
create or replace function public.kk_suivi_dernier_jour_accueil(
  p_enfant_id uuid, p_debut date, p_fin date
) returns date
language sql stable
set search_path = public
as $$
  select max(presence_date) from public.presences
  where enfant_id = p_enfant_id
    and presence_date between p_debut and p_fin
    and status = 'present';
$$;

revoke all on function public.kk_suivi_dernier_jour_accueil(uuid, date, date) from public;

-- ----------------------------------------------------------------------------
-- 2. Trigger de publication : bloque le passage à statut='publiee' tant
--    qu'aucun départ n'est pointé le jour qui compte (periode_fin pour une
--    synthèse jour ; dernier jour d'accueil réellement présent pour
--    semaine/mois/année). C'est la règle bloquante du §5, posée ici pour
--    s'appliquer même à une mise à jour faite hors interface.
-- ----------------------------------------------------------------------------
create or replace function public.kk_suivi_verifier_publication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jour    date;
  v_depart  boolean;
begin
  if new.statut = 'publiee' and old.statut is distinct from 'publiee' then
    if new.periode_type = 'jour' then
      v_jour := new.periode_fin;
    else
      v_jour := public.kk_suivi_dernier_jour_accueil(new.enfant_id, new.periode_debut, new.periode_fin);
    end if;

    if v_jour is null then
      raise exception 'Publication refusée : aucun jour d''accueil présent trouvé dans la période.';
    end if;

    select exists(
      select 1 from public.pointages
      where enfant_id = new.enfant_id
        and action = 'depart'
        and horodatage::date = v_jour
    ) into v_depart;

    if not v_depart then
      raise exception 'Publication refusée : aucun départ pointé le % pour cet enfant.', v_jour;
    end if;

    new.publiee_le := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_suivi_syntheses_publication on public.suivi_syntheses;
create trigger trg_suivi_syntheses_publication
  before update on public.suivi_syntheses
  for each row execute function public.kk_suivi_verifier_publication();

revoke all on function public.kk_suivi_verifier_publication() from public;

-- ----------------------------------------------------------------------------
-- 3. Saisie tablette par code — groupée : plusieurs enfants, un seul
--    toucher. Retourne une ligne par enfant traité (succès ou échec), pour
--    que l'écran puisse afficher un état par tuile sans tout annuler si un
--    seul enfant pose problème.
-- ----------------------------------------------------------------------------
create or replace function public.kk_suivi_kiosk_saisir(
  p_token uuid, p_code text, p_enfant_ids uuid[], p_type text, p_valeur jsonb
) returns table(enfant_id uuid, ok boolean, error text, saisie_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device       public.kiosk_devices;
  v_recent_fail  int;
  v_referent     public.referents;
  v_creche_id    uuid;
  v_enfant_id    uuid;
  v_ok           boolean;
  v_id           uuid;
begin
  select * into v_device from public.kiosk_devices where token = p_token and active = true;
  if v_device is null then
    return query select null::uuid, false, 'token_invalide', null::uuid;
    return;
  end if;

  select count(*) into v_recent_fail
    from public.kiosk_login_attempts
    where device_id = v_device.id and success = false
      and attempted_at > now() - interval '5 minutes';
  if v_recent_fail >= 15 then
    return query select null::uuid, false, 'trop_de_tentatives', null::uuid;
    return;
  end if;

  v_creche_id := v_device.creche_id;

  if p_code is null or p_code !~ '^[0-9]{4}$' then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select null::uuid, false, 'code_invalide', null::uuid;
    return;
  end if;

  select * into v_referent from public.referents
    where creche_id = v_creche_id and code_pointage = p_code limit 1;

  if v_referent.id is null then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select null::uuid, false, 'code_inconnu', null::uuid;
    return;
  end if;

  if p_type not in ('repas','sieste_debut','sieste_fin','change','temperature','humeur','soin','incident','note') then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select null::uuid, false, 'type_invalide', null::uuid;
    return;
  end if;

  insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, true);

  foreach v_enfant_id in array coalesce(p_enfant_ids, array[]::uuid[])
  loop
    v_ok := exists(
      select 1 from public.enfants
      where id = v_enfant_id and creche_id = v_creche_id
        and (date_sortie is null or date_sortie >= current_date)
    );
    if not v_ok then
      return query select v_enfant_id, false, 'enfant_hors_creche', null::uuid;
      continue;
    end if;

    insert into public.suivi_saisies (enfant_id, creche_id, type, valeur, auteur_referent_id, source)
      values (v_enfant_id, v_creche_id, p_type, coalesce(p_valeur, '{}'::jsonb), v_referent.id, 'kiosque_code')
      returning id into v_id;

    return query select v_enfant_id, true, null::text, v_id;
  end loop;
end;
$$;

revoke all on function public.kk_suivi_kiosk_saisir(uuid, text, uuid[], text, jsonb) from public;
grant execute on function public.kk_suivi_kiosk_saisir(uuid, text, uuid[], text, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Observation de développement par code — un seul enfant (les jalons
--    proposés dépendent de son âge, pas groupable comme les soins).
-- ----------------------------------------------------------------------------
create or replace function public.kk_suivi_kiosk_observer(
  p_token uuid, p_code text, p_enfant_id uuid, p_jalon_id uuid,
  p_statut text, p_note text, p_posture text, p_partage text
) returns table(ok boolean, error text, observation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device       public.kiosk_devices;
  v_recent_fail  int;
  v_referent     public.referents;
  v_creche_id    uuid;
  v_id           uuid;
begin
  select * into v_device from public.kiosk_devices where token = p_token and active = true;
  if v_device is null then
    return query select false, 'token_invalide', null::uuid;
    return;
  end if;

  select count(*) into v_recent_fail
    from public.kiosk_login_attempts
    where device_id = v_device.id and success = false
      and attempted_at > now() - interval '5 minutes';
  if v_recent_fail >= 15 then
    return query select false, 'trop_de_tentatives', null::uuid;
    return;
  end if;

  v_creche_id := v_device.creche_id;

  if p_code is null or p_code !~ '^[0-9]{4}$' then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_invalide', null::uuid;
    return;
  end if;

  select * into v_referent from public.referents
    where creche_id = v_creche_id and code_pointage = p_code limit 1;

  if v_referent.id is null then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_inconnu', null::uuid;
    return;
  end if;

  if not exists(
    select 1 from public.enfants
    where id = p_enfant_id and creche_id = v_creche_id
      and (date_sortie is null or date_sortie >= current_date)
  ) then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'enfant_hors_creche', null::uuid;
    return;
  end if;

  if p_jalon_id is not null and not exists(
    select 1 from public.suivi_jalons where id = p_jalon_id and actif
  ) then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'jalon_inconnu', null::uuid;
    return;
  end if;

  insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, true);

  insert into public.suivi_observations
      (enfant_id, creche_id, jalon_id, statut, note, posture, partage, auteur_referent_id, source)
    values (
      p_enfant_id, v_creche_id, p_jalon_id, p_statut, p_note, p_posture,
      coalesce(p_partage, 'interne'), v_referent.id, 'kiosque_code'
    )
    returning id into v_id;

  return query select true, null::text, v_id;
end;
$$;

revoke all on function public.kk_suivi_kiosk_observer(uuid, text, uuid, uuid, text, text, text, text) from public;
grant execute on function public.kk_suivi_kiosk_observer(uuid, text, uuid, uuid, text, text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Annuler (fenêtre de 10 s) — symétrique de kk_kiosk_annuler_dernier.
--    p_table restreint à une valeur littérale parmi deux, jamais interpolé
--    dans du SQL dynamique : pas de surface d'injection.
-- ----------------------------------------------------------------------------
create or replace function public.kk_suivi_kiosk_annuler(
  p_token uuid, p_code text, p_id uuid, p_table text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device     public.kiosk_devices;
  v_referent   public.referents;
  v_creche_id  uuid;
  v_rows       int;
begin
  if p_table not in ('suivi_saisies', 'suivi_observations') then
    return false;
  end if;

  select * into v_device from public.kiosk_devices where token = p_token and active = true;
  if v_device is null or p_code !~ '^[0-9]{4}$' then
    return false;
  end if;
  v_creche_id := v_device.creche_id;

  select * into v_referent from public.referents
    where creche_id = v_creche_id and code_pointage = p_code limit 1;
  if v_referent.id is null then
    return false;
  end if;

  if p_table = 'suivi_saisies' then
    delete from public.suivi_saisies
      where id = p_id and creche_id = v_creche_id and auteur_referent_id = v_referent.id
        and locked_at is null and source = 'kiosque_code'
        and created_at > now() - interval '10 seconds';
  else
    delete from public.suivi_observations
      where id = p_id and creche_id = v_creche_id and auteur_referent_id = v_referent.id
        and locked_at is null and source = 'kiosque_code'
        and created_at > now() - interval '10 seconds';
  end if;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.kk_suivi_kiosk_annuler(uuid, text, uuid, text) from public;
grant execute on function public.kk_suivi_kiosk_annuler(uuid, text, uuid, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Vérification
-- ----------------------------------------------------------------------------
select proname, prosecdef
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'kk_suivi_dernier_jour_accueil', 'kk_suivi_verifier_publication',
    'kk_suivi_kiosk_saisir', 'kk_suivi_kiosk_observer', 'kk_suivi_kiosk_annuler'
  )
order by proname;
