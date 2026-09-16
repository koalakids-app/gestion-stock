-- ============================================================================
-- 37h — Suivi de l'enfant : bascule des fonctions kiosque sur le code image
-- ============================================================================
-- Correction de 37g : la tablette n'utilise plus le code à 4 chiffres pour
-- identifier le personnel (`code_pointage`), mais un code image à 4 pictos
-- (`code_pictos`, cf. kiosque_code_pictos_employes.sql /
-- kiosque_code_pictos_personnel.sql / kk_kiosk_pointer_pictos, déjà en place
-- pour le pointage). Ce script remplace les 3 fonctions de 37g par des
-- versions équivalentes qui identifient la personne par code image, en
-- vérifiant `referents` ET `employes` comme le fait déjà kk_kiosk_pointer_pictos
-- (une professionnelle peut être l'une ou l'autre selon la crèche).
--
-- Les anciennes fonctions à code à 4 chiffres (37g) sont supprimées : elles
-- n'ont jamais été appelées depuis un écran réel, aucune donnée ne dépend
-- de leur signature.
-- ============================================================================

drop function if exists public.kk_suivi_kiosk_saisir(uuid, text, uuid[], text, jsonb);
drop function if exists public.kk_suivi_kiosk_observer(uuid, text, uuid, uuid, text, text, text, text);
drop function if exists public.kk_suivi_kiosk_annuler(uuid, text, uuid, text);

-- ----------------------------------------------------------------------------
-- 1. Un auteur peut être un(e) référent(e) OU un(e) employé(e) (personnel
--    sans compte de connexion) : deux colonnes nullables, une seule remplie
--    à la fois, même principe que pointages.salarie_id/employe_id.
-- ----------------------------------------------------------------------------

alter table public.suivi_saisies
  add column if not exists auteur_employe_id uuid references public.employes(id);

alter table public.suivi_observations
  add column if not exists auteur_employe_id uuid references public.employes(id);

-- ----------------------------------------------------------------------------
-- 2. Saisie tablette par code image — groupée.
-- ----------------------------------------------------------------------------
create or replace function public.kk_suivi_kiosk_saisir(
  p_token uuid, p_code_pictos text[], p_enfant_ids uuid[], p_type text, p_valeur jsonb
) returns table(enfant_id uuid, ok boolean, error text, saisie_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device        public.kiosk_devices;
  v_recent_fail   int;
  v_referent      public.referents;
  v_employe       public.employes;
  v_creche_id     uuid;
  v_matches       int;
  v_ref_id        uuid;
  v_emp_id        uuid;
  v_enfant_id     uuid;
  v_ok            boolean;
  v_id            uuid;
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

  if p_code_pictos is null or not public.kk_valid_code_pictos(p_code_pictos) then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select null::uuid, false, 'code_invalide', null::uuid;
    return;
  end if;

  select * into v_referent from public.referents
    where creche_id = v_creche_id and code_pictos = p_code_pictos limit 1;
  select * into v_employe from public.employes
    where creche_id = v_creche_id and code_pictos = p_code_pictos limit 1;

  v_matches := (case when v_referent.id is not null then 1 else 0 end)
             + (case when v_employe.id is not null then 1 else 0 end);

  if v_matches > 1 then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select null::uuid, false, 'code_ambigu', null::uuid;
    return;
  elsif v_referent.id is not null then
    v_ref_id := v_referent.id;
  elsif v_employe.id is not null then
    v_emp_id := v_employe.id;
  else
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

    insert into public.suivi_saisies
        (enfant_id, creche_id, type, valeur, auteur_referent_id, auteur_employe_id, source)
      values (v_enfant_id, v_creche_id, p_type, coalesce(p_valeur, '{}'::jsonb), v_ref_id, v_emp_id, 'kiosque_code')
      returning id into v_id;

    return query select v_enfant_id, true, null::text, v_id;
  end loop;
end;
$$;

revoke all on function public.kk_suivi_kiosk_saisir(uuid, text[], uuid[], text, jsonb) from public;
grant execute on function public.kk_suivi_kiosk_saisir(uuid, text[], uuid[], text, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Observation de développement par code image — un seul enfant.
-- ----------------------------------------------------------------------------
create or replace function public.kk_suivi_kiosk_observer(
  p_token uuid, p_code_pictos text[], p_enfant_id uuid, p_jalon_id uuid,
  p_statut text, p_note text, p_posture text, p_partage text
) returns table(ok boolean, error text, observation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device        public.kiosk_devices;
  v_recent_fail   int;
  v_referent      public.referents;
  v_employe       public.employes;
  v_creche_id     uuid;
  v_matches       int;
  v_ref_id        uuid;
  v_emp_id        uuid;
  v_id            uuid;
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

  if p_code_pictos is null or not public.kk_valid_code_pictos(p_code_pictos) then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_invalide', null::uuid;
    return;
  end if;

  select * into v_referent from public.referents
    where creche_id = v_creche_id and code_pictos = p_code_pictos limit 1;
  select * into v_employe from public.employes
    where creche_id = v_creche_id and code_pictos = p_code_pictos limit 1;

  v_matches := (case when v_referent.id is not null then 1 else 0 end)
             + (case when v_employe.id is not null then 1 else 0 end);

  if v_matches > 1 then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_ambigu', null::uuid;
    return;
  elsif v_referent.id is not null then
    v_ref_id := v_referent.id;
  elsif v_employe.id is not null then
    v_emp_id := v_employe.id;
  else
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
      (enfant_id, creche_id, jalon_id, statut, note, posture, partage, auteur_referent_id, auteur_employe_id, source)
    values (
      p_enfant_id, v_creche_id, p_jalon_id, p_statut, p_note, p_posture,
      coalesce(p_partage, 'interne'), v_ref_id, v_emp_id, 'kiosque_code'
    )
    returning id into v_id;

  return query select true, null::text, v_id;
end;
$$;

revoke all on function public.kk_suivi_kiosk_observer(uuid, text[], uuid, uuid, text, text, text, text) from public;
grant execute on function public.kk_suivi_kiosk_observer(uuid, text[], uuid, uuid, text, text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Annuler (fenêtre de 10 s) par code image.
-- ----------------------------------------------------------------------------
create or replace function public.kk_suivi_kiosk_annuler(
  p_token uuid, p_code_pictos text[], p_id uuid, p_table text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device     public.kiosk_devices;
  v_referent   public.referents;
  v_employe    public.employes;
  v_creche_id  uuid;
  v_ref_id     uuid;
  v_emp_id     uuid;
  v_rows       int;
begin
  if p_table not in ('suivi_saisies', 'suivi_observations') then
    return false;
  end if;

  select * into v_device from public.kiosk_devices where token = p_token and active = true;
  if v_device is null or p_code_pictos is null or not public.kk_valid_code_pictos(p_code_pictos) then
    return false;
  end if;
  v_creche_id := v_device.creche_id;

  select * into v_referent from public.referents
    where creche_id = v_creche_id and code_pictos = p_code_pictos limit 1;
  select * into v_employe from public.employes
    where creche_id = v_creche_id and code_pictos = p_code_pictos limit 1;

  if v_referent.id is not null and v_employe.id is not null then
    return false;
  elsif v_referent.id is not null then
    v_ref_id := v_referent.id;
  elsif v_employe.id is not null then
    v_emp_id := v_employe.id;
  else
    return false;
  end if;

  if p_table = 'suivi_saisies' then
    delete from public.suivi_saisies
      where id = p_id and creche_id = v_creche_id
        and ((v_ref_id is not null and auteur_referent_id = v_ref_id)
          or (v_emp_id is not null and auteur_employe_id = v_emp_id))
        and locked_at is null and source = 'kiosque_code'
        and created_at > now() - interval '10 seconds';
  else
    delete from public.suivi_observations
      where id = p_id and creche_id = v_creche_id
        and ((v_ref_id is not null and auteur_referent_id = v_ref_id)
          or (v_emp_id is not null and auteur_employe_id = v_emp_id))
        and locked_at is null and source = 'kiosque_code'
        and created_at > now() - interval '10 seconds';
  end if;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.kk_suivi_kiosk_annuler(uuid, text[], uuid, text) from public;
grant execute on function public.kk_suivi_kiosk_annuler(uuid, text[], uuid, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Vérification
-- ----------------------------------------------------------------------------
select proname, prosecdef, pronargs
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('kk_suivi_kiosk_saisir', 'kk_suivi_kiosk_observer', 'kk_suivi_kiosk_annuler')
order by proname;
