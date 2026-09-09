-- ============================================================================
-- Module "Employés" — personnel sans compte de connexion (agents d'entretien,
-- remplaçantes ponctuelles, etc.), distinct de `referents` qui porte les
-- comptes avec accès à l'application (direction, référentes).
-- ============================================================================
-- Table calquée sur `enfants` : pas de compte requis pour exister. Un
-- `user_id` nullable est prévu dès maintenant pour permettre plus tard de
-- relier un employé à un compte auth.users et lui ouvrir l'accès à certains
-- modules — non exploité pour l'instant, juste la colonne pour éviter une
-- migration future.
--
-- Nommée `employes` (et non `salaries`) pour ne pas se confondre avec la
-- colonne `pointages.salarie_id`, qui référence spécifiquement `referents`.
-- ============================================================================

create table if not exists public.employes (
  id           uuid primary key default gen_random_uuid(),
  creche_id    uuid references public.creches(id),
  prenom       text not null,
  nom          text,
  poste        text,
  email        text,
  user_id      uuid references auth.users(id),
  code_pointage text,
  created_at   timestamptz not null default now(),
  constraint employes_code_pointage_format check (code_pointage ~ '^[0-9]{4}$')
);

create unique index if not exists employes_code_pointage_uniq
  on public.employes (creche_id, code_pointage) where code_pointage is not null;

alter table public.employes enable row level security;

-- Même portée que enfants/referents/kiosk_devices : direction = tout,
-- référente = sa crèche uniquement, jamais d'accès anonyme.
create policy employes_select on public.employes
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = employes.creche_id)
    )
  );

create policy employes_insert on public.employes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = employes.creche_id)
    )
  );

create policy employes_update on public.employes
  for update to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = employes.creche_id)
    )
  )
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = employes.creche_id)
    )
  );

create policy employes_delete on public.employes
  for delete to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = employes.creche_id)
    )
  );

-- ----------------------------------------------------------------------------
-- Génération automatique du code_pointage (même logique que enfants/referents,
-- étendue pour croiser les trois tables : un code doit rester non ambigu pour
-- la tablette, qui ne sait pas d'avance si un code tapé désigne un enfant, un
-- référent ou un employé).
-- ----------------------------------------------------------------------------

create or replace function public.kk_gen_code_pointage(p_creche_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_taken boolean;
  v_attempts int := 0;
begin
  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 200 then
      raise exception 'Impossible de générer un code_pointage unique pour la crèche %', p_creche_id;
    end if;
    v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
    select exists(
      select 1 from public.enfants where creche_id = p_creche_id and code_pointage = v_code
      union all
      select 1 from public.referents where creche_id = p_creche_id and code_pointage = v_code
      union all
      select 1 from public.employes where creche_id = p_creche_id and code_pointage = v_code
    ) into v_taken;
    exit when not v_taken;
  end loop;
  return v_code;
end;
$$;

create or replace function public.kk_trg_set_code_pointage_employe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code_pointage is null and new.creche_id is not null then
    new.code_pointage := public.kk_gen_code_pointage(new.creche_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employes_code_pointage on public.employes;
create trigger trg_employes_code_pointage
  before insert on public.employes
  for each row execute function public.kk_trg_set_code_pointage_employe();

-- Backfill (aucune ligne existante normalement, la table vient d'être créée,
-- mais gardé par cohérence avec le script initial).
update public.employes
  set code_pointage = public.kk_gen_code_pointage(creche_id)
  where code_pointage is null and creche_id is not null;

-- ----------------------------------------------------------------------------
-- pointages : troisième colonne cible, employe_id. `salarie_id` reste
-- réservé à `referents` (contrainte pointages_salarie_id_fkey existante) —
-- impossible d'y loger un id d'`employes` sans la casser.
-- ----------------------------------------------------------------------------

alter table public.pointages
  add column if not exists employe_id uuid references public.employes(id) on delete cascade;

alter table public.pointages drop constraint if exists pointages_cible_unique;
alter table public.pointages add constraint pointages_cible_unique check (
  (enfant_id is not null and salarie_id is null and employe_id is null) or
  (enfant_id is null and salarie_id is not null and employe_id is null) or
  (enfant_id is null and salarie_id is null and employe_id is not null)
);

-- ----------------------------------------------------------------------------
-- kk_kiosk_pointer : cherche maintenant parmi enfants, referents ET employes.
-- ----------------------------------------------------------------------------

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

-- ----------------------------------------------------------------------------
-- kk_kiosk_annuler_dernier : idem, étendu à employe_id.
-- ----------------------------------------------------------------------------

create or replace function public.kk_kiosk_annuler_dernier(p_token uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device      public.kiosk_devices;
  v_enfant_id   uuid;
  v_referent_id uuid;
  v_employe_id  uuid;
  v_creche_id   uuid;
  v_rows        int;
begin
  select * into v_device from public.kiosk_devices where token = p_token and active = true;
  if v_device is null or p_code !~ '^[0-9]{4}$' then
    return false;
  end if;
  v_creche_id := v_device.creche_id;

  select id into v_enfant_id from public.enfants
    where creche_id = v_creche_id and code_pointage = p_code limit 1;
  select id into v_referent_id from public.referents
    where creche_id = v_creche_id and code_pointage = p_code limit 1;
  select id into v_employe_id from public.employes
    where creche_id = v_creche_id and code_pointage = p_code limit 1;

  delete from public.pointages
    where creche_id = v_creche_id
      and source = 'kiosque_code'
      and horodatage > now() - interval '2 minutes'
      and (
        (v_enfant_id is not null and enfant_id = v_enfant_id)
        or (v_referent_id is not null and salarie_id = v_referent_id)
        or (v_employe_id is not null and employe_id = v_employe_id)
      )
      and id = (
        select id from public.pointages p2
        where p2.creche_id = v_creche_id
          and p2.source = 'kiosque_code'
          and ((v_enfant_id is not null and p2.enfant_id = v_enfant_id)
               or (v_referent_id is not null and p2.salarie_id = v_referent_id)
               or (v_employe_id is not null and p2.employe_id = v_employe_id))
        order by p2.horodatage desc
        limit 1
      );

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.kk_gen_code_pointage(uuid) from public;
grant execute on function public.kk_gen_code_pointage(uuid) to authenticated;
