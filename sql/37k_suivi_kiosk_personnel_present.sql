-- ============================================================================
-- 37k — Suivi de l'enfant : identification par sélection dans la liste du
-- personnel présent, à la place du code image
-- ============================================================================
-- Le code image (4 pictos) était jugé trop long pour un geste qui doit
-- rester sous les 10 secondes. Remplacé par une liste du personnel déjà
-- pointé arrivé ce jour-là sur cette crèche : on clique son nom, terminé.
--
-- Compromis assumé : plus de vérification individuelle à chaque geste — la
-- liste elle-même ne montre que les personnes réellement pointées arrivées
-- (donc censées être physiquement là), et chaque écriture revérifie côté
-- serveur que l'identifiant fourni correspond bien à une personne présente
-- de cette crèche, mais n'importe qui devant la tablette peut choisir
-- n'importe quel nom affiché. Cohérent avec un appareil physiquement
-- contrôlé en salle, moins strict qu'un code individuel.
--
-- Remplace les fonctions à code image posées en 37h (kk_suivi_kiosk_saisir/
-- observer/annuler) par des versions à p_auteur_type/p_auteur_id. La
-- fonction de vérification de code posée en 37j (kk_suivi_kiosk_identifier)
-- devient inutile ici mais n'est pas supprimée (elle ne gêne pas).
-- ============================================================================

drop function if exists public.kk_suivi_kiosk_saisir(uuid, text[], uuid[], text, jsonb);
drop function if exists public.kk_suivi_kiosk_observer(uuid, text[], uuid, uuid, text, text, text, text);
drop function if exists public.kk_suivi_kiosk_annuler(uuid, text[], uuid, text);

-- ----------------------------------------------------------------------------
-- 1. Liste du personnel présent (dernier pointage du jour = arrivée),
--    référent(e)s et employé(e)s confondus, scopée par le token de la
--    tablette — même principe que kk_suivi_kiosk_enfants_presents (37i).
-- ----------------------------------------------------------------------------
create or replace function public.kk_suivi_kiosk_personnel_present(p_token uuid)
returns table(id uuid, type text, label text, sub text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device    public.kiosk_devices;
  v_creche_id uuid;
begin
  select * into v_device from public.kiosk_devices where token = p_token and active = true;
  if v_device is null then
    return;
  end if;
  v_creche_id := v_device.creche_id;

  return query
    with dernier as (
      select distinct on (coalesce(p.salarie_id, p.employe_id))
        coalesce(p.salarie_id, p.employe_id) as personne_id,
        (case when p.salarie_id is not null then 'referent' else 'employe' end) as type,
        p.action
      from public.pointages p
      where p.creche_id = v_creche_id
        and (p.salarie_id is not null or p.employe_id is not null)
        and p.horodatage::date = current_date
      order by coalesce(p.salarie_id, p.employe_id), p.horodatage desc
    )
    select r.id, 'referent'::text, r.name,
           coalesce(r.poste, case when r.role = 'direction' then 'Direction' else 'Référente' end)
    from dernier d join public.referents r on r.id = d.personne_id
    where d.type = 'referent' and d.action = 'arrivee'
    union all
    select em.id, 'employe'::text, em.prenom, coalesce(em.poste, 'Employé(e)')
    from dernier d join public.employes em on em.id = d.personne_id
    where d.type = 'employe' and d.action = 'arrivee'
    order by 3;
end;
$$;

revoke all on function public.kk_suivi_kiosk_personnel_present(uuid) from public;
grant execute on function public.kk_suivi_kiosk_personnel_present(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Vérifie qu'un id+type donné est bien une personne présente (pointée
--    arrivée aujourd'hui) de la crèche du token — revalidé côté serveur à
--    chaque écriture, indépendamment de ce que montre la liste côté client.
-- ----------------------------------------------------------------------------
create or replace function public.kk_suivi_verifier_auteur_present(p_creche_id uuid, p_type text, p_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists(
    select 1 from public.pointages p
    where p.creche_id = p_creche_id
      and p.horodatage::date = current_date
      and ((p_type = 'referent' and p.salarie_id = p_id) or (p_type = 'employe' and p.employe_id = p_id))
      and p.action = 'arrivee'
      and p.horodatage = (
        select max(p2.horodatage) from public.pointages p2
        where p2.creche_id = p_creche_id and p2.horodatage::date = current_date
          and ((p_type = 'referent' and p2.salarie_id = p_id) or (p_type = 'employe' and p2.employe_id = p_id))
      )
  );
$$;

revoke all on function public.kk_suivi_verifier_auteur_present(uuid, text, uuid) from public;

-- ----------------------------------------------------------------------------
-- 3. Saisie tablette — groupée, identifiée par id+type de personne présente.
-- ----------------------------------------------------------------------------
create or replace function public.kk_suivi_kiosk_saisir(
  p_token uuid, p_auteur_type text, p_auteur_id uuid, p_enfant_ids uuid[], p_type text, p_valeur jsonb
) returns table(enfant_id uuid, ok boolean, error text, saisie_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device     public.kiosk_devices;
  v_creche_id  uuid;
  v_enfant_id  uuid;
  v_ok         boolean;
  v_id         uuid;
begin
  select * into v_device from public.kiosk_devices where token = p_token and active = true;
  if v_device is null then
    return query select null::uuid, false, 'token_invalide', null::uuid;
    return;
  end if;
  v_creche_id := v_device.creche_id;

  if p_auteur_type not in ('referent','employe') or p_auteur_id is null
     or not public.kk_suivi_verifier_auteur_present(v_creche_id, p_auteur_type, p_auteur_id) then
    return query select null::uuid, false, 'auteur_absent', null::uuid;
    return;
  end if;

  if p_type not in ('repas','sieste_debut','sieste_fin','change','temperature','humeur','soin','incident','note') then
    return query select null::uuid, false, 'type_invalide', null::uuid;
    return;
  end if;

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
      values (
        v_enfant_id, v_creche_id, p_type, coalesce(p_valeur, '{}'::jsonb),
        case when p_auteur_type = 'referent' then p_auteur_id end,
        case when p_auteur_type = 'employe' then p_auteur_id end,
        'kiosque_code'
      )
      returning id into v_id;

    return query select v_enfant_id, true, null::text, v_id;
  end loop;
end;
$$;

revoke all on function public.kk_suivi_kiosk_saisir(uuid, text, uuid, uuid[], text, jsonb) from public;
grant execute on function public.kk_suivi_kiosk_saisir(uuid, text, uuid, uuid[], text, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Observation de développement — un seul enfant.
-- ----------------------------------------------------------------------------
create or replace function public.kk_suivi_kiosk_observer(
  p_token uuid, p_auteur_type text, p_auteur_id uuid, p_enfant_id uuid, p_jalon_id uuid,
  p_statut text, p_note text, p_posture text, p_partage text
) returns table(ok boolean, error text, observation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device     public.kiosk_devices;
  v_creche_id  uuid;
  v_id         uuid;
begin
  select * into v_device from public.kiosk_devices where token = p_token and active = true;
  if v_device is null then
    return query select false, 'token_invalide', null::uuid;
    return;
  end if;
  v_creche_id := v_device.creche_id;

  if p_auteur_type not in ('referent','employe') or p_auteur_id is null
     or not public.kk_suivi_verifier_auteur_present(v_creche_id, p_auteur_type, p_auteur_id) then
    return query select false, 'auteur_absent', null::uuid;
    return;
  end if;

  if not exists(
    select 1 from public.enfants
    where id = p_enfant_id and creche_id = v_creche_id
      and (date_sortie is null or date_sortie >= current_date)
  ) then
    return query select false, 'enfant_hors_creche', null::uuid;
    return;
  end if;

  if p_jalon_id is not null and not exists(
    select 1 from public.suivi_jalons where id = p_jalon_id and actif
  ) then
    return query select false, 'jalon_inconnu', null::uuid;
    return;
  end if;

  insert into public.suivi_observations
      (enfant_id, creche_id, jalon_id, statut, note, posture, partage, auteur_referent_id, auteur_employe_id, source)
    values (
      p_enfant_id, v_creche_id, p_jalon_id, p_statut, p_note, p_posture,
      coalesce(p_partage, 'interne'),
      case when p_auteur_type = 'referent' then p_auteur_id end,
      case when p_auteur_type = 'employe' then p_auteur_id end,
      'kiosque_code'
    )
    returning id into v_id;

  return query select true, null::text, v_id;
end;
$$;

revoke all on function public.kk_suivi_kiosk_observer(uuid, text, uuid, uuid, uuid, text, text, text, text) from public;
grant execute on function public.kk_suivi_kiosk_observer(uuid, text, uuid, uuid, uuid, text, text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Annuler (fenêtre de 10 s).
-- ----------------------------------------------------------------------------
create or replace function public.kk_suivi_kiosk_annuler(
  p_token uuid, p_auteur_type text, p_auteur_id uuid, p_id uuid, p_table text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device     public.kiosk_devices;
  v_creche_id  uuid;
  v_rows       int;
begin
  if p_table not in ('suivi_saisies', 'suivi_observations') then
    return false;
  end if;

  select * into v_device from public.kiosk_devices where token = p_token and active = true;
  if v_device is null then
    return false;
  end if;
  v_creche_id := v_device.creche_id;

  if p_auteur_type not in ('referent','employe') or p_auteur_id is null
     or not public.kk_suivi_verifier_auteur_present(v_creche_id, p_auteur_type, p_auteur_id) then
    return false;
  end if;

  if p_table = 'suivi_saisies' then
    delete from public.suivi_saisies
      where id = p_id and creche_id = v_creche_id
        and ((p_auteur_type = 'referent' and auteur_referent_id = p_auteur_id)
          or (p_auteur_type = 'employe' and auteur_employe_id = p_auteur_id))
        and locked_at is null and source = 'kiosque_code'
        and created_at > now() - interval '10 seconds';
  else
    delete from public.suivi_observations
      where id = p_id and creche_id = v_creche_id
        and ((p_auteur_type = 'referent' and auteur_referent_id = p_auteur_id)
          or (p_auteur_type = 'employe' and auteur_employe_id = p_auteur_id))
        and locked_at is null and source = 'kiosque_code'
        and created_at > now() - interval '10 seconds';
  end if;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.kk_suivi_kiosk_annuler(uuid, text, uuid, uuid, text) from public;
grant execute on function public.kk_suivi_kiosk_annuler(uuid, text, uuid, uuid, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Vérification
-- ----------------------------------------------------------------------------
select proname, prosecdef, pronargs
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'kk_suivi_kiosk_personnel_present', 'kk_suivi_verifier_auteur_present',
    'kk_suivi_kiosk_saisir', 'kk_suivi_kiosk_observer', 'kk_suivi_kiosk_annuler'
  )
order by proname;
