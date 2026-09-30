-- ============================================================================
-- Code image : un(e) directeur/trice technique lié(e) à sa fiche collaborateur
-- (referents.employe_id, cf. sql/referents_lien_employe.sql) n'a qu'UN SEUL code
-- image — le même sur les deux fiches.
-- ============================================================================
-- Avant : referents.code_pictos et employes.code_pictos étaient tirés
-- séparément (generer_code_pictos_referent / generer_code_pictos_employe), donc
-- une personne présente dans les deux tables avait deux codes différents.
--
-- Ce script :
--   1. rend les deux générateurs uniques sur referents ET employes (un code
--      ne peut plus désigner deux personnes différentes au kiosque) ;
--   2. synchronise les deux colonnes par trigger dès qu'un lien existe (à la
--      génération, à la régénération et à la pose du lien) ;
--   3. réécrit kk_kiosk_pointer_pictos : un code qui correspond à un référent
--      ET à son employé lié n'est plus « ambigu » ; le pointage est alors
--      enregistré sur employes.id (comme le fait déjà le mode kiosque pour les
--      fiches liées, cf. js/kiosque.js) ;
--   4. aligne les liens déjà existants (le code du référent l'emporte).
--
-- Prérequis : claude_37-kiosque-code-images.sql,
-- kiosque_code_pictos_personnel.sql, kiosque_code_pictos_employes.sql,
-- referents_lien_employe.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Générateurs : unicité sur referents + employes
-- ----------------------------------------------------------------------------

create or replace function public.generer_code_pictos_referent(p_creche_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pool     text[] := public.kk_pictos_pool();
  v_code     text[];
  v_taken    boolean;
  v_attempts int := 0;
begin
  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 200 then
      raise exception 'Impossible de générer un code_pictos unique pour la crèche %', p_creche_id;
    end if;

    select array_agg(picto) into v_code
      from (select picto from unnest(v_pool) as picto order by random() limit 4) s;

    select exists(select 1 from public.referents where creche_id = p_creche_id and code_pictos = v_code)
        or exists(select 1 from public.employes  where creche_id = p_creche_id and code_pictos = v_code)
      into v_taken;

    exit when not v_taken;
  end loop;

  return v_code;
end;
$$;

create or replace function public.generer_code_pictos_employe(p_creche_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pool     text[] := public.kk_pictos_pool();
  v_code     text[];
  v_taken    boolean;
  v_attempts int := 0;
begin
  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 200 then
      raise exception 'Impossible de générer un code_pictos unique pour la crèche %', p_creche_id;
    end if;

    select array_agg(picto) into v_code
      from (select picto from unnest(v_pool) as picto order by random() limit 4) s;

    select exists(select 1 from public.referents where creche_id = p_creche_id and code_pictos = v_code)
        or exists(select 1 from public.employes  where creche_id = p_creche_id and code_pictos = v_code)
      into v_taken;

    exit when not v_taken;
  end loop;

  return v_code;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Synchronisation referents <-> employes
--    Chaque UPDATE ne réécrit que si la valeur diffère : pas de boucle.
-- ----------------------------------------------------------------------------

create or replace function public.kk_sync_code_pictos_referent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.employe_id is null then
    return null;
  end if;

  if new.code_pictos is not null then
    update public.employes
       set code_pictos = new.code_pictos
     where id = new.employe_id
       and code_pictos is distinct from new.code_pictos;
  else
    -- Lien posé sur un référent sans code : il reprend celui de l'employé.
    update public.referents r
       set code_pictos = e.code_pictos
      from public.employes e
     where r.id = new.id and e.id = new.employe_id
       and e.code_pictos is not null;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_kk_sync_code_pictos_referent on public.referents;
create trigger trg_kk_sync_code_pictos_referent
  after insert or update of code_pictos, employe_id on public.referents
  for each row execute function public.kk_sync_code_pictos_referent();

create or replace function public.kk_sync_code_pictos_employe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code_pictos is not null then
    update public.referents
       set code_pictos = new.code_pictos
     where employe_id = new.id
       and code_pictos is distinct from new.code_pictos;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_kk_sync_code_pictos_employe on public.employes;
create trigger trg_kk_sync_code_pictos_employe
  after update of code_pictos on public.employes
  for each row execute function public.kk_sync_code_pictos_employe();

-- ----------------------------------------------------------------------------
-- 3. kk_kiosk_pointer_pictos : un référent et son employé lié ne sont plus
--    « ambigus » ; le pointage d'une fiche liée va sur employes.id.
-- ----------------------------------------------------------------------------

create or replace function public.kk_kiosk_pointer_pictos(p_token uuid, p_code text[])
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

  if not public.kk_valid_code_pictos(p_code) or p_code is null then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_invalide', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select * into v_referent from public.referents
    where creche_id = v_creche_id and code_pictos = p_code
    limit 1;

  select * into v_employe from public.employes
    where creche_id = v_creche_id and code_pictos = p_code
    limit 1;

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
    return query select false, 'code_inconnu', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

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

revoke all on function public.kk_kiosk_pointer_pictos(uuid, text[]) from public;
grant execute on function public.kk_kiosk_pointer_pictos(uuid, text[]) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Alignement des liens existants : le code du référent l'emporte ; à défaut
--    le référent reprend celui de son employé. (Les triggers font le travail.)
-- ----------------------------------------------------------------------------

update public.referents r
   set code_pictos = coalesce(r.code_pictos, e.code_pictos)
  from public.employes e
 where r.employe_id = e.id
   and (r.code_pictos is distinct from e.code_pictos)
   and coalesce(r.code_pictos, e.code_pictos) is not null;

-- Le trigger ci-dessus ne se déclenche que si code_pictos change côté référent ;
-- on pousse donc explicitement le code du référent sur l'employé lié.
update public.employes e
   set code_pictos = r.code_pictos
  from public.referents r
 where r.employe_id = e.id
   and r.code_pictos is not null
   and e.code_pictos is distinct from r.code_pictos;

-- ============================================================================
-- Fin.
-- Rappel : ce script réécrit kk_kiosk_pointer_pictos (corps repris de
-- kiosque_code_pictos_employes.sql) ; comparez avec la version en production
-- si elle a divergé depuis.
-- ============================================================================
