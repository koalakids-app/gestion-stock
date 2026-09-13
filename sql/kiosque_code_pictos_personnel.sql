-- ============================================================================
-- Kiosque "par code image" — extension au PERSONNEL (referents), en
-- remplacement du code à 4 chiffres pour le pointage sur tablette.
-- ============================================================================
-- Complète sql/claude_37-kiosque-code-images.sql (qui n'équipait que les
-- enfants) et sql/kiosque_code_pointage.sql (qui définit kk_kiosk_pointer,
-- le pointage du personnel par token de tablette + code à 4 chiffres).
--
-- Le personnel pointe via kk_kiosk_pointer(token, code), qui exige le token
-- de la tablette en plus du code — contrairement à verifier_code_pointage()
-- (enfants), volontairement plus permissif (cf. note de sécurité en tête de
-- claude_37-kiosque-code-images.sql). On garde ce niveau de protection pour
-- le personnel : ce script ajoute donc un second kk_kiosk_pointer(), avec
-- une signature (uuid, text[]) au lieu de (uuid, text), qui vérifie
-- referents.code_pictos au lieu de referents.code_pointage. La version
-- numérique existante n'est pas touchée.
--
-- referents.code_pointage (le code à 4 chiffres) n'est pas supprimé par ce
-- script : la colonne reste en base, mais l'interface (annuaire des
-- directeurs techniques, tablette.html) ne propose plus que le code image
-- pour le personnel après ce changement.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colonne code_pictos sur referents (même contrainte que enfants.code_pictos,
--    réutilise kk_valid_code_pictos()/kk_pictos_pool() de claude_37-kiosque-
--    code-images.sql — exécuter ce script-là en premier s'il ne l'a pas déjà
--    été).
-- ----------------------------------------------------------------------------

alter table public.referents
  add column if not exists code_pictos text[]
    constraint referents_code_pictos_format check (public.kk_valid_code_pictos(code_pictos));

create unique index if not exists referents_code_pictos_uniq
  on public.referents (creche_id, code_pictos) where code_pictos is not null;

-- ----------------------------------------------------------------------------
-- 2. Génération d'un code image pour un référent (mirroir de
--    generer_code_pictos(), mais sur la table referents).
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

    select exists(
      select 1 from public.referents
        where creche_id = p_creche_id and code_pictos = v_code
    ) into v_taken;

    exit when not v_taken;
  end loop;

  return v_code;
end;
$$;

revoke all on function public.generer_code_pictos_referent(uuid) from public;
grant execute on function public.generer_code_pictos_referent(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. kk_kiosk_pointer, variante code image (surcharge : même nom, signature
--    différente). Réutilise kiosk_devices + kiosk_login_attempts (même
--    anti-bruteforce que la version numérique). Ne regarde jamais `enfants`
--    (les enfants ont déjà leur propre chemin, verifier_code_pointage()).
-- ----------------------------------------------------------------------------

create or replace function public.kk_kiosk_pointer(p_token uuid, p_code text[])
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
  v_creche_id     uuid;
  v_last_action   text;
  v_new_action    text;
  v_horodatage    timestamptz;
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

  if v_referent.id is null then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_inconnu', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select p.action into v_last_action
    from public.pointages p
    where p.creche_id = v_creche_id
      and p.salarie_id = v_referent.id
      and p.horodatage::date = current_date
    order by p.horodatage desc
    limit 1;

  v_new_action := case when v_last_action = 'arrivee' then 'depart' else 'arrivee' end;

  insert into public.pointages as pt (creche_id, salarie_id, action, effectue_par, source)
    values (v_creche_id, v_referent.id, v_new_action, null, 'kiosque_code')
    returning pt.horodatage into v_horodatage;

  insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, true);

  return query select true, null::text, 'salarie', v_referent.name,
    coalesce(v_referent.poste, case when v_referent.role = 'direction' then 'Direction' else 'Directeur/trice technique' end),
    v_new_action, v_horodatage;
end;
$$;

revoke all on function public.kk_kiosk_pointer(uuid, text[]) from public;
grant execute on function public.kk_kiosk_pointer(uuid, text[]) to anon, authenticated;

-- ============================================================================
-- Fin.
--
-- Rappel avant mise en prod :
--   1. Exécuter d'abord sql/claude_37-kiosque-code-images.sql si ce n'est pas
--      déjà fait (ce script réutilise kk_pictos_pool()/kk_valid_code_pictos()
--      qui y sont définis).
--   2. Chaque directeur/trice technique doit se voir générer un code image
--      depuis l'annuaire (bouton « Générer un code image ») avant de pouvoir
--      pointer sur la tablette — le code à 4 chiffres existant continue de
--      fonctionner tant qu'aucun code image n'a été généré, le temps de la
--      transition.
-- ============================================================================
