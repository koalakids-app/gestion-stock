-- ============================================================================
-- Traçabilité de l'origine d'une présence : pointage réel (tablette/kiosque)
-- vs coche manuelle. Sert uniquement à l'affichage (Gantt Présences) — aucune
-- logique métier n'en dépend.
-- ============================================================================

alter table public.presences add column if not exists source text not null default 'manuel';

alter table public.presences drop constraint if exists presences_source_check;
alter table public.presences add constraint presences_source_check
  check (source in ('manuel', 'pointage'));

-- kk_kiosk_pointer (tablette par code) : les lignes qu'elle crée sont un pointage réel.
create or replace function public.kk_kiosk_pointer(p_token uuid, p_code text)
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
  v_enfant        public.enfants;
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
begin
  select * into v_device from public.kiosk_devices
    where token = p_token and active = true;

  if v_device is null then
    return query select false, 'token_invalide', null::text, null::text, null::text, null::text, null::timestamptz;
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

  v_creche_id := v_device.creche_id;

  if p_code is null or p_code !~ '^[0-9]{4}$' then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_invalide', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select * into v_enfant from public.enfants
    where creche_id = v_creche_id and code_pointage = p_code
      and (date_sortie is null or date_sortie >= current_date)
    limit 1;

  select * into v_referent from public.referents
    where creche_id = v_creche_id and code_pointage = p_code
    limit 1;

  select * into v_employe from public.employes
    where creche_id = v_creche_id and code_pointage = p_code
    limit 1;

  v_matches := (case when v_enfant.id is not null then 1 else 0 end)
             + (case when v_referent.id is not null then 1 else 0 end)
             + (case when v_employe.id is not null then 1 else 0 end);

  if v_matches > 1 then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_ambigu', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  elsif v_enfant.id is not null then
    v_type := 'enfant';
    v_id := v_enfant.id;
    v_label := v_enfant.prenom;
    v_sub := v_enfant.nom;
  elsif v_referent.id is not null then
    v_type := 'salarie';
    v_id := v_referent.id;
    v_label := v_referent.name;
    v_sub := coalesce(v_referent.poste, case when v_referent.role = 'direction' then 'Direction' else 'Référente' end);
  elsif v_employe.id is not null then
    v_type := 'employe';
    v_id := v_employe.id;
    v_label := v_employe.prenom;
    v_sub := coalesce(v_employe.poste, 'Employé(e)');
  else
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_inconnu', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select p.action into v_last_action
    from public.pointages p
    where p.creche_id = v_creche_id
      and ((v_type = 'enfant' and p.enfant_id = v_id)
        or (v_type = 'salarie' and p.salarie_id = v_id)
        or (v_type = 'employe' and p.employe_id = v_id))
      and p.horodatage::date = current_date
    order by p.horodatage desc
    limit 1;

  v_new_action := case when v_last_action = 'arrivee' then 'depart' else 'arrivee' end;

  if v_type = 'enfant' then
    insert into public.pointages as pt (creche_id, enfant_id, action, effectue_par, source)
      values (v_creche_id, v_id, v_new_action, null, 'kiosque_code')
      returning pt.horodatage into v_horodatage;
    if v_new_action = 'arrivee' then
      insert into public.presences (enfant_id, presence_date, slot, status, source)
        values (v_id, current_date, 'M', 'present', 'pointage')
        on conflict (enfant_id, presence_date, slot) do nothing;
      insert into public.presences (enfant_id, presence_date, slot, status, source)
        values (v_id, current_date, 'A', 'present', 'pointage')
        on conflict (enfant_id, presence_date, slot) do nothing;
    end if;
  elsif v_type = 'salarie' then
    insert into public.pointages as pt (creche_id, salarie_id, action, effectue_par, source)
      values (v_creche_id, v_id, v_new_action, null, 'kiosque_code')
      returning pt.horodatage into v_horodatage;
  else
    insert into public.pointages as pt (creche_id, employe_id, action, effectue_par, source)
      values (v_creche_id, v_id, v_new_action, null, 'kiosque_code')
      returning pt.horodatage into v_horodatage;
  end if;

  insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, true);

  return query select true, null::text, v_type, v_label, v_sub, v_new_action, v_horodatage;
end;
$$;
