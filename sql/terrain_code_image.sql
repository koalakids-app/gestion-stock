-- ============================================================================
-- Accès terrain par code image (option par crèche)
-- ============================================================================
-- La direction active l'option dans Paramètres › Les établissements. Sur la
-- tablette de la crèche (même jeton que le pointage, lien terrain.html?k=…),
-- la personne tape son code de 4 images au lieu de l'e-mail et du mot de passe.
-- Le serveur (edge function terrain-code-image) ouvre alors SA session : tout
-- ce qui suit (droits par crèche, journaux, infirmerie) reste inchangé.
--
-- Prérequis : kiosque_code_pointage.sql, claude_37-kiosque-code-images.sql,
-- kiosque_code_pictos_lien_employe.sql. À appliquer à la main, puis déployer :
--   supabase functions deploy terrain-code-image --no-verify-jwt
-- ============================================================================

alter table public.creches
  add column if not exists terrain_code_image boolean not null default false;

-- ----------------------------------------------------------------------------
-- 1. Mode de la tablette (lisible sans compte : n'expose ni nom ni code)
-- ----------------------------------------------------------------------------

create or replace function public.kk_terrain_mode(p_token uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.terrain_code_image
       from public.kiosk_devices d
       join public.creches c on c.id = d.creche_id
      where d.token = p_token and d.active = true),
    false);
$$;

revoke all on function public.kk_terrain_mode(uuid) from public;
grant execute on function public.kk_terrain_mode(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Identification : renvoie l'identifiant du compte, réservé au service.
--    Appelée uniquement par l'edge function (clé service) : jamais par un
--    navigateur, donc l'identifiant du compte ne sort pas vers la tablette.
--    Plus strict que le pointage : 5 échecs en 10 minutes bloquent la tablette
--    (le pool n'a que 8 images, soit 1 680 codes possibles).
-- ----------------------------------------------------------------------------

create or replace function public.kk_terrain_identifier(p_token uuid, p_code text[])
returns table(ok boolean, error text, user_id uuid, label text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device   public.kiosk_devices;
  v_actif    boolean;
  v_fails    int;
  v_ids      uuid[];
  v_ref      public.referents;
begin
  select * into v_device from public.kiosk_devices where token = p_token and active = true;
  if v_device is null then
    return query select false, 'token_invalide', null::uuid, null::text; return;
  end if;

  select c.terrain_code_image into v_actif from public.creches c where c.id = v_device.creche_id;
  if not coalesce(v_actif, false) then
    return query select false, 'mode_desactive', null::uuid, null::text; return;
  end if;

  select count(*) into v_fails from public.kiosk_login_attempts
   where device_id = v_device.id and success = false
     and attempted_at > now() - interval '10 minutes';
  if v_fails >= 5 then
    return query select false, 'trop_de_tentatives', null::uuid, null::text; return;
  end if;

  if p_code is null or not public.kk_valid_code_pictos(p_code) then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_invalide', null::uuid, null::text; return;
  end if;

  -- Fiches de la crèche portant ce code : référent·e directement, ou employé·e
  -- via la fiche référent liée (même personne = un seul résultat).
  select array_agg(distinct r.id) into v_ids
    from public.referents r
   where r.creche_id = v_device.creche_id
     and (r.code_pictos = p_code
          or r.employe_id in (select e.id from public.employes e
                               where e.creche_id = v_device.creche_id and e.code_pictos = p_code));

  if v_ids is null then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_inconnu', null::uuid, null::text; return;
  end if;
  if array_length(v_ids, 1) > 1 then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_ambigu', null::uuid, null::text; return;
  end if;

  select * into v_ref from public.referents where id = v_ids[1];
  if v_ref.role = 'direction' then
    return query select false, 'code_direction', null::uuid, null::text; return;
  end if;
  if v_ref.user_id is null then
    return query select false, 'sans_compte', null::uuid, null::text; return;
  end if;

  insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, true);
  return query select true, null::text, v_ref.user_id, v_ref.name;
end;
$$;

revoke all on function public.kk_terrain_identifier(uuid, text[]) from public, anon, authenticated;
grant execute on function public.kk_terrain_identifier(uuid, text[]) to service_role;
