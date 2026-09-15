-- ============================================================================
-- Kiosque "par code image" — extension aux EMPLOYÉS (table `employes`, le
-- personnel sans compte de connexion), en remplacement du code à 4 chiffres
-- pour le pointage sur tablette.
-- ============================================================================
-- Complète sql/claude_37-kiosque-code-images.sql (enfants) et
-- sql/kiosque_code_pictos_personnel.sql (referents) : ces deux scripts avaient
-- laissé la table `employes` de côté, qui n'a donc gardé que le code à
-- 4 chiffres (employes.code_pointage, cf. sql/module_employes.sql) alors que
-- les référents étaient déjà passés au code image.
--
-- employes.code_pointage n'est pas supprimé par ce script : la colonne reste
-- en base et continue de fonctionner (kk_kiosk_pointer, la version à 4
-- chiffres, n'est pas modifiée), mais l'interface (espace Employés) ne
-- propose plus que le code image une fois celui-ci généré pour la personne —
-- même principe de transition que pour les référents.
--
-- kk_kiosk_pointer_pictos(token, code_pictos[]) est la fonction réellement
-- appelée par tablette.html en mode "Personnel" (voir sa constante
-- pictoCodePerso) : elle ne vérifiait jusqu'ici que `referents`. Ce script la
-- réécrit pour vérifier aussi `employes`, sur le même principe de
-- désambiguïsation que kk_kiosk_pointer (uuid, text) — la version à 4
-- chiffres qui couvre déjà enfants/referents/employes (sql/module_employes.sql).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colonne code_pictos sur employes (même contrainte que enfants/referents,
--    réutilise kk_valid_code_pictos()/kk_pictos_pool() de
--    claude_37-kiosque-code-images.sql — exécuter ce script-là en premier
--    s'il ne l'a pas déjà été).
-- ----------------------------------------------------------------------------

alter table public.employes
  add column if not exists code_pictos text[]
    constraint employes_code_pictos_format check (public.kk_valid_code_pictos(code_pictos));

create unique index if not exists employes_code_pictos_uniq
  on public.employes (creche_id, code_pictos) where code_pictos is not null;

-- ----------------------------------------------------------------------------
-- 2. Génération d'un code image pour un employé (mirroir de
--    generer_code_pictos_referent, mais sur la table employes).
-- ----------------------------------------------------------------------------

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

    select exists(
      select 1 from public.employes
        where creche_id = p_creche_id and code_pictos = v_code
    ) into v_taken;

    exit when not v_taken;
  end loop;

  return v_code;
end;
$$;

revoke all on function public.generer_code_pictos_employe(uuid) from public;
grant execute on function public.generer_code_pictos_employe(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. kk_kiosk_pointer_pictos : réécrite pour vérifier referents ET employes
--    (ambiguïté gérée comme dans kk_kiosk_pointer à 4 chiffres). Reprend le
--    corps de kk_kiosk_pointer(uuid, text[]) posé par
--    kiosque_code_pictos_personnel.sql pour la partie referents — cette
--    dernière fonction (nom historique, jamais réellement appelée par
--    tablette.html) n'est pas touchée ici.
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

  v_matches := (case when v_referent.id is not null then 1 else 0 end)
             + (case when v_employe.id is not null then 1 else 0 end);

  if v_matches > 1 then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_ambigu', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  elsif v_referent.id is not null then
    v_type := 'salarie';
    v_id := v_referent.id;
    v_label := v_referent.name;
    v_sub := coalesce(v_referent.poste, case when v_referent.role = 'direction' then 'Direction' else 'Directeur/trice technique' end);
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

-- ============================================================================
-- Fin.
--
-- Rappel avant mise en prod :
--   1. Exécuter d'abord sql/claude_37-kiosque-code-images.sql et
--      sql/kiosque_code_pictos_personnel.sql si ce n'est pas déjà fait.
--   2. Ce script réécrit kk_kiosk_pointer_pictos avec le contenu qu'on lui
--      connaît côté référents (repris de kk_kiosk_pointer(uuid, text[]) de
--      kiosque_code_pictos_personnel.sql) : si sa définition en production a
--      divergé de celle-là depuis, comparez avant d'exécuter ce script.
--   3. Chaque employé(e) doit se voir générer un code image depuis l'espace
--      Employés (bouton « Générer un code image ») avant de pouvoir pointer
--      sur la tablette — le code à 4 chiffres existant continue de
--      fonctionner tant qu'aucun code image n'a été généré.
--   4. Déployer aussi l'edge function envoyer-code-pictos-employe :
--        supabase functions deploy envoyer-code-pictos-employe
-- ============================================================================
