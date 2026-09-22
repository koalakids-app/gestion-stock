-- ============================================================================
-- Validation mensuelle des heures par signature électronique (collaborateur.html)
-- ============================================================================
-- En fin de mois, un(e) collaborateur/trice (table employes) ou une référente
-- (table referents) peut valider, d'un tracé de signature, le total d'heures
-- que l'application a calculé pour le mois écoulé à partir de ses pointages
-- (même appariement arrivée→départ que kk_collaborateur_heures_annuelles).
-- Une fois signé, un mois est figé : ni le/la collaborateur/trice ni la
-- direction ne peuvent le modifier depuis l'application (seule une requête
-- SQL directe le pourrait, comme pour un document déjà signé ailleurs dans
-- l'appli). Le total signé est stocké à part de `pointages` : si des
-- pointages sont corrigés après coup, la valeur validée par la signature ne
-- bouge pas rétroactivement — elle reste la preuve de ce qui a été présenté
-- et accepté ce jour-là.
-- ============================================================================

create table if not exists public.heures_validations_mensuelles (
  id                uuid primary key default gen_random_uuid(),
  creche_id         uuid not null references public.creches(id),
  employe_id        uuid references public.employes(id),
  referent_id       uuid references public.referents(id),
  annee             int not null,
  mois              int not null check (mois between 1 and 12),
  heures_realisees  numeric not null,
  signe_par         text not null,
  signature         text not null,
  signe_le          timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  constraint heures_validations_un_seul_titulaire check (
    (employe_id is not null and referent_id is null)
    or (employe_id is null and referent_id is not null)
  )
);

create unique index if not exists heures_validations_employe_mois_uniq
  on public.heures_validations_mensuelles (employe_id, annee, mois)
  where employe_id is not null;

create unique index if not exists heures_validations_referent_mois_uniq
  on public.heures_validations_mensuelles (referent_id, annee, mois)
  where referent_id is not null;

alter table public.heures_validations_mensuelles enable row level security;

-- Lecture : le/la titulaire pour ses propres signatures, la direction et les
-- référentes de la crèche pour toutes (même portée que employes_select).
create policy heures_validations_select_self on public.heures_validations_mensuelles
  for select to authenticated
  using (
    exists (
      select 1 from public.employes e
      where e.user_id = auth.uid() and e.id = heures_validations_mensuelles.employe_id
    )
    or exists (
      select 1 from public.referents r
      where r.user_id = auth.uid() and r.id = heures_validations_mensuelles.referent_id
    )
  );

create policy heures_validations_select_direction on public.heures_validations_mensuelles
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = heures_validations_mensuelles.creche_id)
    )
  );

-- Aucune policy insert/update/delete pour authenticated : l'écriture ne passe
-- que par la fonction security definer ci-dessous, qui vérifie elle-même
-- l'identité de l'appelant et recalcule le total plutôt que de faire
-- confiance à une valeur envoyée par le client.

-- ----------------------------------------------------------------------------
-- Total d'heures réalisées sur un mois donné, pour la personne connectée
-- (mêmes règles d'appariement arrivée→départ que le compteur annuel). Utilisé
-- par collaborateur.html pour afficher le total avant signature.
-- ----------------------------------------------------------------------------
create or replace function public.kk_heures_realisees_mois(p_annee int, p_mois int)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id          uuid;
  v_est_employe boolean;
  v_debut       date := make_date(p_annee, p_mois, 1);
  v_fin         date := (make_date(p_annee, p_mois, 1) + interval '1 month' - interval '1 day')::date;
  v_realisees   numeric := 0;
begin
  select id into v_id from public.employes where user_id = auth.uid();
  if v_id is not null then
    v_est_employe := true;
  else
    select id into v_id from public.referents where user_id = auth.uid();
    if v_id is null then
      raise exception 'Aucune fiche collaborateur ou référente liée à ce compte.';
    end if;
    v_est_employe := false;
  end if;

  select coalesce(sum(extract(epoch from (p.depart - p.arrivee)) / 3600.0), 0)
    into v_realisees
  from (
    select
      horodatage as arrivee,
      lead(horodatage) over (order by horodatage) as depart,
      action,
      lead(action) over (order by horodatage) as action_suivante
    from public.pointages
    where ((v_est_employe and employe_id = v_id) or (not v_est_employe and salarie_id = v_id))
      and horodatage >= v_debut and horodatage < (v_fin + 1)
  ) p
  where p.action = 'arrivee' and p.action_suivante = 'depart';

  return round(v_realisees, 2);
end;
$$;

revoke all on function public.kk_heures_realisees_mois(int, int) from public;
grant execute on function public.kk_heures_realisees_mois(int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- Signature du mois : recalcule elle-même le total (jamais celui envoyé par
-- le client), refuse un mois non encore terminé et refuse une double
-- signature.
-- ----------------------------------------------------------------------------
create or replace function public.kk_signer_heures_mois(p_annee int, p_mois int, p_nom text, p_signature text)
returns public.heures_validations_mensuelles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employe     public.employes;
  v_referent    public.referents;
  v_creche_id   uuid;
  v_realisees   numeric;
  v_row         public.heures_validations_mensuelles;
  v_mois_debut  date := make_date(p_annee, p_mois, 1);
begin
  if v_mois_debut >= date_trunc('month', current_date)::date then
    raise exception 'Ce mois n''est pas encore terminé — la validation n''est possible qu''une fois le mois écoulé.';
  end if;
  if coalesce(trim(p_nom), '') = '' then
    raise exception 'Le nom du signataire est requis.';
  end if;
  if coalesce(length(p_signature), 0) < 100 then
    raise exception 'Signature manquante ou invalide.';
  end if;

  select * into v_employe from public.employes where user_id = auth.uid();
  if v_employe.id is not null then
    v_creche_id := v_employe.creche_id;
  else
    select * into v_referent from public.referents where user_id = auth.uid();
    if v_referent.id is null then
      raise exception 'Aucune fiche collaborateur ou référente liée à ce compte.';
    end if;
    v_creche_id := v_referent.creche_id;
  end if;

  if exists (
    select 1 from public.heures_validations_mensuelles h
    where h.annee = p_annee and h.mois = p_mois
      and ((v_employe.id is not null and h.employe_id = v_employe.id)
        or (v_employe.id is null and h.referent_id = v_referent.id))
  ) then
    raise exception 'Les heures de ce mois ont déjà été validées.';
  end if;

  v_realisees := public.kk_heures_realisees_mois(p_annee, p_mois);

  insert into public.heures_validations_mensuelles
    (creche_id, employe_id, referent_id, annee, mois, heures_realisees, signe_par, signature)
  values (
    v_creche_id,
    v_employe.id,
    case when v_employe.id is null then v_referent.id else null end,
    p_annee, p_mois, v_realisees, trim(p_nom), p_signature
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.kk_signer_heures_mois(int, int, text, text) from public;
grant execute on function public.kk_signer_heures_mois(int, int, text, text) to authenticated;
