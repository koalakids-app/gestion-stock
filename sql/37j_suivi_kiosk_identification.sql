-- ============================================================================
-- 37j — Suivi de l'enfant : vérification immédiate du code image
-- ============================================================================
-- Jusqu'ici, l'écran d'identification de suivi.html mémorisait le code
-- sans le vérifier, et ne le testait qu'au premier geste réel (repas,
-- sieste...) via kk_suivi_kiosk_saisir/observer. En pratique, une personne
-- qui tape un code faux (mauvais ordre, mauvaise image) passait quand même
-- à la grille des enfants — qui ne dépend pas de l'identification — et ne
-- découvrait l'erreur qu'au clic sur un bouton, sans lien évident avec
-- l'identification faite une minute plus tôt.
--
-- Cette fonction vérifie le code immédiatement, sans effet de bord (aucune
-- écriture), sur le même principe de désambiguïsation referents/employes
-- que kk_kiosk_pointer_pictos.
-- ============================================================================

create or replace function public.kk_suivi_kiosk_identifier(p_token uuid, p_code_pictos text[])
returns table(ok boolean, error text, label text, sub text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device       public.kiosk_devices;
  v_recent_fail  int;
  v_referent     public.referents;
  v_employe      public.employes;
  v_creche_id    uuid;
  v_matches      int;
begin
  select * into v_device from public.kiosk_devices where token = p_token and active = true;
  if v_device is null then
    return query select false, 'token_invalide', null::text, null::text;
    return;
  end if;

  select count(*) into v_recent_fail
    from public.kiosk_login_attempts
    where device_id = v_device.id and success = false
      and attempted_at > now() - interval '5 minutes';
  if v_recent_fail >= 15 then
    return query select false, 'trop_de_tentatives', null::text, null::text;
    return;
  end if;

  v_creche_id := v_device.creche_id;

  if p_code_pictos is null or not public.kk_valid_code_pictos(p_code_pictos) then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_invalide', null::text, null::text;
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
    return query select false, 'code_ambigu', null::text, null::text;
    return;
  elsif v_referent.id is not null then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, true);
    return query select true, null::text, v_referent.name,
      coalesce(v_referent.poste, case when v_referent.role = 'direction' then 'Direction' else 'Référente' end);
    return;
  elsif v_employe.id is not null then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, true);
    return query select true, null::text, v_employe.prenom, coalesce(v_employe.poste, 'Employé(e)');
    return;
  else
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_inconnu', null::text, null::text;
    return;
  end if;
end;
$$;

revoke all on function public.kk_suivi_kiosk_identifier(uuid, text[]) from public;
grant execute on function public.kk_suivi_kiosk_identifier(uuid, text[]) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Vérification
-- ----------------------------------------------------------------------------
select proname, prosecdef, pronargs
from pg_proc
where pronamespace = 'public'::regnamespace and proname = 'kk_suivi_kiosk_identifier';
