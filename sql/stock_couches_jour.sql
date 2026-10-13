-- ============================================================================
-- Couches du jour (tablette Suivi) — saisie du nombre de couches utilisées
-- par enfant et par jour, qui décompte le stock (stock_couches).
-- ============================================================================
-- La taille et le type (couche / culotte) viennent de la fiche enfant
-- (enfants.taille_couche / enfants.type_couche, sql/enfants_taille_couche.sql).
--
-- Cette saisie est la SEULE source de décompte : le trigger qui décomptait
-- une couche à chaque « Change » du suivi est désactivé ci-dessous (la
-- fonction reste en place, pour le réactiver : create trigger
-- trg_stock_couches_change after insert or delete on public.suivi_saisies
-- for each row execute function public.kk_stock_couches_appliquer_saisie();).
--
-- Le nombre saisi est le TOTAL de la journée pour l'enfant. Le stock n'est
-- décrémenté que de la différence avec les saisies précédentes du jour.
-- Corriger le nombre à la baisse recrédite le stock.
-- ============================================================================

drop trigger if exists trg_stock_couches_change on public.suivi_saisies;

create table if not exists public.couches_jour (
  enfant_id   uuid not null references public.enfants(id) on delete cascade,
  jour        date not null default current_date,
  nb          integer not null default 0 check (nb >= 0 and nb <= 30),
  updated_at  timestamptz not null default now(),
  primary key (enfant_id, jour)
);
alter table public.couches_jour enable row level security;
-- Aucun accès direct : lecture/écriture uniquement via les fonctions ci-dessous.

alter table public.stock_couches_mouvements drop constraint if exists stock_couches_mouvements_motif_check;
alter table public.stock_couches_mouvements
  add constraint stock_couches_mouvements_motif_check
  check (motif in ('reception','ajustement','change_auto','annulation_change','couches_jour'));

-- Lecture : enfants présents aujourd'hui + taille/type + nombre déjà saisi.
create or replace function public.kk_couches_kiosk_enfants(p_token uuid)
returns table(id uuid, prenom text, nom text, taille_couche text, type_couche text, nb integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.kiosk_devices;
begin
  select * into v_device from public.kiosk_devices where token = p_token and active = true;
  if v_device is null then return; end if;

  return query
    with dernier as (
      select distinct on (p.enfant_id) p.enfant_id, p.action
      from public.pointages p
      where p.creche_id = v_device.creche_id and p.enfant_id is not null
        and p.horodatage::date = current_date
      order by p.enfant_id, p.horodatage desc
    )
    select e.id, e.prenom, e.nom, e.taille_couche, coalesce(e.type_couche,'couche'),
           coalesce(cj.nb, 0)
    from public.enfants e
    join dernier d on d.enfant_id = e.id
    left join public.couches_jour cj on cj.enfant_id = e.id and cj.jour = current_date
    where e.creche_id = v_device.creche_id
      and (d.action = 'arrivee' or cj.nb is not null)
    order by e.prenom;
end;
$$;
revoke all on function public.kk_couches_kiosk_enfants(uuid) from public;
grant execute on function public.kk_couches_kiosk_enfants(uuid) to anon, authenticated;

-- Écriture : fixe le total du jour pour un enfant et ajuste le stock.
create or replace function public.kk_couches_kiosk_saisir(
  p_token uuid, p_auteur_type text, p_auteur_id uuid, p_enfant_id uuid, p_nb integer
) returns table(ok boolean, error text, nb integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device   public.kiosk_devices;
  v_enfant   public.enfants;
  v_creche   text;
  v_deja     integer;
  v_delta    integer;
begin
  select * into v_device from public.kiosk_devices where token = p_token and active = true;
  if v_device is null then
    return query select false, 'token_invalide', null::integer; return;
  end if;
  if p_auteur_type not in ('referent','employe') or p_auteur_id is null
     or not public.kk_suivi_verifier_auteur_present(v_device.creche_id, p_auteur_type, p_auteur_id) then
    return query select false, 'auteur_absent', null::integer; return;
  end if;
  if p_nb is null or p_nb < 0 or p_nb > 30 then
    return query select false, 'nombre_invalide', null::integer; return;
  end if;

  select * into v_enfant from public.enfants
    where id = p_enfant_id and creche_id = v_device.creche_id;
  if v_enfant.id is null then
    return query select false, 'enfant_hors_creche', null::integer; return;
  end if;
  if v_enfant.taille_couche is null then
    return query select false, 'taille_inconnue', null::integer; return;
  end if;

  select public.kk_stock_couches_nom_court(name) into v_creche from public.creches where id = v_device.creche_id;

  select cj.nb into v_deja from public.couches_jour cj
    where cj.enfant_id = p_enfant_id and cj.jour = current_date;
  v_deja := coalesce(v_deja, 0);
  v_delta := -(p_nb - v_deja);

  insert into public.couches_jour (enfant_id, jour, nb)
    values (p_enfant_id, current_date, p_nb)
    on conflict (enfant_id, jour) do update set nb = excluded.nb, updated_at = now();

  if v_delta <> 0 then
    insert into public.stock_couches (creche, type_couche, taille, stock)
      values (v_creche, coalesce(v_enfant.type_couche,'couche'), v_enfant.taille_couche, v_delta)
      on conflict (creche, type_couche, taille) do update
        set stock = public.stock_couches.stock + v_delta, updated_at = now();

    insert into public.stock_couches_mouvements
      (creche, type_couche, taille, delta, motif, enfant_id, auteur_referent_id)
      values (v_creche, coalesce(v_enfant.type_couche,'couche'), v_enfant.taille_couche,
              v_delta, 'couches_jour', p_enfant_id,
              case when p_auteur_type = 'referent' then p_auteur_id end);
  end if;

  return query select true, null::text, p_nb;
end;
$$;
revoke all on function public.kk_couches_kiosk_saisir(uuid, text, uuid, uuid, integer) from public;
grant execute on function public.kk_couches_kiosk_saisir(uuid, text, uuid, uuid, integer) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Vue ordinateur (référentes / direction authentifiées)
-- ----------------------------------------------------------------------------
-- Direction (referents.creche_id null) : toutes les crèches ; référente
-- scopée : sa crèche uniquement.
create or replace function public.kk_couches_ordi_autorise(p_creche_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.referents r
    where r.user_id = auth.uid() and (r.creche_id is null or r.creche_id = p_creche_id));
$$;
revoke all on function public.kk_couches_ordi_autorise(uuid) from public;
grant execute on function public.kk_couches_ordi_autorise(uuid) to authenticated;

create or replace function public.kk_couches_ordi_enfants(p_creche_id uuid, p_jour date)
returns table(id uuid, prenom text, nom text, taille_couche text, type_couche text, nb integer, present boolean)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.kk_couches_ordi_autorise(p_creche_id) then return; end if;
  return query
    select e.id, e.prenom, e.nom, e.taille_couche, coalesce(e.type_couche,'couche'),
           coalesce(cj.nb,0),
           exists(select 1 from public.pointages p
                  where p.enfant_id = e.id and p.creche_id = p_creche_id and p.horodatage::date = p_jour)
    from public.enfants e
    left join public.couches_jour cj on cj.enfant_id = e.id and cj.jour = p_jour
    where e.creche_id = p_creche_id
      and (e.date_sortie is null or e.date_sortie >= p_jour)
    order by 7 desc, e.prenom;
end;
$$;
revoke all on function public.kk_couches_ordi_enfants(uuid, date) from public;
grant execute on function public.kk_couches_ordi_enfants(uuid, date) to authenticated;

create or replace function public.kk_couches_ordi_saisir(p_enfant_id uuid, p_jour date, p_nb integer)
returns table(ok boolean, error text, nb integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_enfant public.enfants;
  v_creche text;
  v_deja   integer;
  v_delta  integer;
  v_ref    uuid;
begin
  select * into v_enfant from public.enfants where id = p_enfant_id;
  if v_enfant.id is null or not public.kk_couches_ordi_autorise(v_enfant.creche_id) then
    return query select false, 'non_autorise', null::integer; return;
  end if;
  if p_nb is null or p_nb < 0 or p_nb > 30 or p_jour is null or p_jour > current_date then
    return query select false, 'valeur_invalide', null::integer; return;
  end if;
  if v_enfant.taille_couche is null then
    return query select false, 'taille_inconnue', null::integer; return;
  end if;

  select public.kk_stock_couches_nom_court(name) into v_creche from public.creches where id = v_enfant.creche_id;
  select id into v_ref from public.referents where user_id = auth.uid() limit 1;

  select cj.nb into v_deja from public.couches_jour cj
    where cj.enfant_id = p_enfant_id and cj.jour = p_jour;
  v_delta := -(p_nb - coalesce(v_deja, 0));

  insert into public.couches_jour (enfant_id, jour, nb) values (p_enfant_id, p_jour, p_nb)
    on conflict (enfant_id, jour) do update set nb = excluded.nb, updated_at = now();

  if v_delta <> 0 then
    insert into public.stock_couches (creche, type_couche, taille, stock)
      values (v_creche, coalesce(v_enfant.type_couche,'couche'), v_enfant.taille_couche, v_delta)
      on conflict (creche, type_couche, taille) do update
        set stock = public.stock_couches.stock + v_delta, updated_at = now();
    insert into public.stock_couches_mouvements
      (creche, type_couche, taille, delta, motif, enfant_id, auteur_referent_id)
      values (v_creche, coalesce(v_enfant.type_couche,'couche'), v_enfant.taille_couche,
              v_delta, 'couches_jour', p_enfant_id, v_ref);
  end if;
  return query select true, null::text, p_nb;
end;
$$;
revoke all on function public.kk_couches_ordi_saisir(uuid, date, integer) from public;
grant execute on function public.kk_couches_ordi_saisir(uuid, date, integer) to authenticated;
