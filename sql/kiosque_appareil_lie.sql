-- ============================================================================
-- Pointage : une tablette = un appareil. Tablette « réunion » pour les référents.
-- ============================================================================
-- Problème : le lien du kiosque (jeton) peut être copié sur un téléphone, et un
-- salarié pouvait pointer de chez lui avec son code.
--
-- Règle :
--   - le jeton d'une tablette est lié au PREMIER appareil qui l'ouvre
--     (`kk_kiosk_lier`, appelé au chargement de tablette.html) ; ensuite il est
--     refusé partout ailleurs (`autre_appareil`) ;
--   - la direction peut dissocier l'appareil (Paramètres › tablettes) pour
--     changer de tablette ;
--   - type 'reunion' : tablette de la direction pour les réunions hors crèche.
--     Seuls les référents (crèche renseignée) y pointent ; le pointage va sur
--     leur propre crèche, source 'kiosque_reunion'. Pas d'enfants.
--
-- ORDRE : 1. déployer js/pages/tablette.js ; 2. lancer ce script ;
-- 3. ouvrir tout de suite le lien de pointage sur CHAQUE tablette de crèche
-- (c'est cette ouverture qui lie l'appareil). Les téléphones sont refusés
-- ensuite. Idempotent. Remplace les fonctions à 2 arguments par des versions à
-- 3 arguments (p_appareil).
-- ============================================================================

alter table public.kiosk_devices
  add column if not exists appareil_id text,
  add column if not exists appareil_lie_le timestamptz,
  add column if not exists type text not null default 'creche';

alter table public.kiosk_devices drop constraint if exists kiosk_devices_type_check;
alter table public.kiosk_devices
  add constraint kiosk_devices_type_check check (type in ('creche', 'reunion'));

alter table public.pointages drop constraint if exists pointages_source_check;
alter table public.pointages
  add constraint pointages_source_check
  check (source in ('kiosque_connecte', 'kiosque_code', 'correction', 'kiosque_reunion'));

-- ----------------------------------------------------------------------------
-- Liaison de l'appareil (premier appareil gagnant)
-- ----------------------------------------------------------------------------
create or replace function public.kk_kiosk_lier(p_token uuid, p_appareil text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.kiosk_devices;
begin
  select * into v_device from public.kiosk_devices
    where token = p_token and active = true;
  if v_device.id is null then return 'token_invalide'; end if;
  if p_appareil is null or length(p_appareil) < 16 then return 'appareil_invalide'; end if;

  if v_device.appareil_id is null then
    update public.kiosk_devices
       set appareil_id = p_appareil, appareil_lie_le = now()
     where id = v_device.id and appareil_id is null;
    select * into v_device from public.kiosk_devices where id = v_device.id;
  end if;

  if v_device.appareil_id = p_appareil then return 'ok'; end if;
  return 'autre_appareil';
end;
$$;

revoke all on function public.kk_kiosk_lier(uuid, text) from public;
grant execute on function public.kk_kiosk_lier(uuid, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Pointage du personnel (remplace kk_kiosk_pointer_pictos(uuid, text[]))
-- ----------------------------------------------------------------------------
drop function if exists public.kk_kiosk_pointer_pictos(uuid, text[]);

create or replace function public.kk_kiosk_pointer_pictos(p_token uuid, p_code text[], p_appareil text default null)
returns table(
  ok boolean,
  error text,
  type text,
  label text,
  sub text,
  action text,
  horodatage timestamptz
)
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
  v_id            uuid;
  v_type          text;
  v_label         text;
  v_sub           text;
  v_last_action   text;
  v_new_action    text;
  v_horodatage    timestamptz;
  v_matches       int;
  v_source        text;
  v_reunion       boolean;
begin
  select * into v_device from public.kiosk_devices
    where token = p_token and active = true;

  if v_device is null then
    return query select false, 'token_invalide', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  -- Le jeton n'est valable que sur l'appareil qui lui est lié.
  if v_device.appareil_id is null or p_appareil is distinct from v_device.appareil_id then
    return query select false,
      case when v_device.appareil_id is null then 'appareil_inconnu' else 'autre_appareil' end,
      null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select count(*) into v_recent_fail
    from public.kiosk_login_attempts
    where device_id = v_device.id
      and success = false
      and attempted_at > now() - interval '5 minutes';

  if v_recent_fail >= 15 then
    return query select false, 'trop_de_tentatives', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  v_reunion := (v_device.type = 'reunion');
  v_creche_id := v_device.creche_id;
  v_source := case when v_reunion then 'kiosque_reunion' else 'kiosque_code' end;

  if not public.kk_valid_code_pictos(p_code) or p_code is null then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_invalide', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_reunion then
    -- Tablette de réunion : référents seulement, toutes crèches (la crèche du
    -- pointage est celle du référent). Un même code dans deux crèches = ambigu.
    select count(*) into v_matches from public.referents
      where creche_id is not null and code_pictos = p_code;
    if v_matches > 1 then
      insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
      return query select false, 'code_ambigu', null::text, null::text, null::text, null::text, null::timestamptz;
      return;
    end if;
    select * into v_referent from public.referents
      where creche_id is not null and code_pictos = p_code
      limit 1;
    v_creche_id := v_referent.creche_id;
  else
    select * into v_referent from public.referents
      where creche_id = v_creche_id and code_pictos = p_code
      limit 1;

    select * into v_employe from public.employes
      where creche_id = v_creche_id and code_pictos = p_code
      limit 1;
  end if;

  -- Référent + employé lié à ce référent = une seule personne, pas une ambiguïté.
  if v_referent.id is not null and v_employe.id is not null
     and v_referent.employe_id = v_employe.id then
    v_matches := 1;
  else
    v_matches := (case when v_referent.id is not null then 1 else 0 end)
               + (case when v_employe.id is not null then 1 else 0 end);
  end if;

  if v_matches > 1 then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_ambigu', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  elsif v_referent.id is not null then
    v_label := v_referent.name;
    v_sub := coalesce(v_referent.poste, case when v_referent.role = 'direction' then 'Direction' else 'Directeur/trice technique' end);
    if v_referent.employe_id is not null then
      v_type := 'employe';            -- fiche liée : pointage sur employes.id
      v_id := v_referent.employe_id;
    else
      v_type := 'salarie';
      v_id := v_referent.id;
    end if;
  elsif v_employe.id is not null then
    v_type := 'employe';
    v_id := v_employe.id;
    v_label := v_employe.prenom;
    v_sub := coalesce(v_employe.poste, 'Employé(e)');
  else
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false,
      case when v_reunion then 'reunion_referents_seulement' else 'code_inconnu' end,
      null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_reunion then v_sub := 'Réunion hors crèche'; end if;

  select p.action into v_last_action
    from public.pointages p
    where p.creche_id = v_creche_id
      and ((v_type = 'salarie' and p.salarie_id = v_id)
        or (v_type = 'employe' and p.employe_id = v_id))
      and p.horodatage::date = current_date
    order by p.horodatage desc
    limit 1;

  v_new_action := case when v_last_action = 'arrivee' then 'depart' else 'arrivee' end;

  if v_type = 'salarie' then
    insert into public.pointages as pt (creche_id, salarie_id, action, effectue_par, source)
      values (v_creche_id, v_id, v_new_action, null, v_source)
      returning pt.horodatage into v_horodatage;
  else
    insert into public.pointages as pt (creche_id, employe_id, action, effectue_par, source)
      values (v_creche_id, v_id, v_new_action, null, v_source)
      returning pt.horodatage into v_horodatage;
  end if;

  insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, true);

  return query select true, null::text, v_type, v_label, v_sub, v_new_action, v_horodatage;
end;
$$;

revoke all on function public.kk_kiosk_pointer_pictos(uuid, text[], text) from public;
grant execute on function public.kk_kiosk_pointer_pictos(uuid, text[], text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Pointage des enfants (remplace kk_kiosk_pointer_enfant_pictos(uuid, text[]))
-- ----------------------------------------------------------------------------
drop function if exists public.kk_kiosk_pointer_enfant_pictos(uuid, text[]);

create or replace function public.kk_kiosk_pointer_enfant_pictos(p_token uuid, p_code text[], p_appareil text default null)
returns table(
  ok          boolean,
  error       text,
  enfant_id   uuid,
  prenom      text,
  nom         text,
  action      text,
  horodatage  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device       public.kiosk_devices;
  v_enfant       public.enfants;
  v_recent_fail  int;
  v_last_action  text;
  v_new_action   text;
  v_horodatage   timestamptz;
begin
  select * into v_device from public.kiosk_devices
    where token = p_token and active = true;

  if v_device is null then
    return query select false, 'token_invalide', null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_device.type = 'reunion' then
    return query select false, 'reunion_referents_seulement', null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_device.appareil_id is null or p_appareil is distinct from v_device.appareil_id then
    return query select false,
      case when v_device.appareil_id is null then 'appareil_inconnu' else 'autre_appareil' end,
      null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select count(*) into v_recent_fail
    from public.kiosk_login_attempts
    where device_id = v_device.id
      and success = false
      and attempted_at > now() - interval '5 minutes';

  if v_recent_fail >= 15 then
    return query select false, 'trop_de_tentatives', null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if p_code is null or not public.kk_valid_code_pictos(p_code) then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_invalide', null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select * into v_enfant from public.enfants
    where creche_id = v_device.creche_id and code_pictos = p_code
      and (date_sortie is null or date_sortie >= current_date)
    limit 1;

  if v_enfant.id is null then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_inconnu', null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, true);

  select p.action into v_last_action
    from public.pointages p
    where p.creche_id = v_device.creche_id
      and p.enfant_id = v_enfant.id
      and p.horodatage::date = current_date
    order by p.horodatage desc
    limit 1;

  v_new_action := case when v_last_action = 'arrivee' then 'depart' else 'arrivee' end;

  insert into public.pointages as pt (creche_id, enfant_id, action, effectue_par, source)
    values (v_device.creche_id, v_enfant.id, v_new_action, null, 'kiosque_code')
    returning pt.horodatage into v_horodatage;

  return query select true, null::text, v_enfant.id, v_enfant.prenom, v_enfant.nom, v_new_action, v_horodatage;
end;
$$;

revoke all on function public.kk_kiosk_pointer_enfant_pictos(uuid, text[], text) from public;
grant execute on function public.kk_kiosk_pointer_enfant_pictos(uuid, text[], text) to anon, authenticated;
