-- ============================================================================
-- Kiosque : pointage des enfants par code image — jeton de tablette obligatoire
--
-- Problème : verifier_code_pointage(p_creche_id, p_code) était appelable par
-- n'importe qui (rôle anon) connaissant l'UUID d'une crèche. Le pool d'images
-- ne compte que 8 pictos (8*7*6*5 = 1 680 codes) : le code d'un enfant pouvait
-- être deviné par force brute, ce qui enregistrait un faux pointage et révélait
-- le prénom et le nom de l'enfant. L'attaquant pouvait aussi verrouiller la
-- tablette (15 échecs = blocage de 5 minutes).
--
-- Correctif : même schéma que kk_kiosk_pointer_pictos (adultes) — la fonction
-- exige le jeton secret de la tablette (kiosk_devices.token) et l'anti-bruteforce
-- se fait par appareil (kiosk_login_attempts), pas par crèche.
--
-- Ordre de déploiement (aucune coupure) :
--   1. Lancer la PARTIE 1 (crée la nouvelle fonction, l'ancienne reste active).
--   2. Déployer js/pages/tablette.js (appelle la nouvelle fonction).
--   3. Vérifier qu'un pointage enfant fonctionne sur une tablette.
--   4. Lancer la PARTIE 2 (supprime l'ancienne fonction).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTIE 1 — nouvelle fonction
-- ----------------------------------------------------------------------------

create or replace function public.kk_kiosk_pointer_enfant_pictos(p_token uuid, p_code text[])
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

  -- Anti-bruteforce par appareil : 15 échecs sur 5 minutes = blocage temporaire.
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

-- La tablette appelle sans compte (rôle anon), mais le jeton secret fait office
-- de clé : on ne laisse aucun accès par défaut (PUBLIC).
revoke all on function public.kk_kiosk_pointer_enfant_pictos(uuid, text[]) from public;
grant execute on function public.kk_kiosk_pointer_enfant_pictos(uuid, text[]) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- PARTIE 2 — à lancer UNIQUEMENT après déploiement de tablette.js
-- (supprime la fonction vulnérable ; la table kiosk_pictos_attempts n'est plus
-- alimentée mais reste en place, vide de droits, pour l'historique)
-- ----------------------------------------------------------------------------

-- drop function if exists public.verifier_code_pointage(uuid, text[]);
