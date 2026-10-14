-- ============================================================================
-- Registre de sécurité : saisie d'un contrôle par un intervenant externe
-- ============================================================================
-- Pour les contrôles hors échéancier réglementaire (ex. contrôle de l'eau du
-- robinet, purge du réseau, aire de jeux…), la direction affiche un QR code /
-- un lien par crèche. La personne de passage ouvre registre-visiteur.html sans
-- compte, renseigne son contrôle et signe au doigt. L'écriture arrive dans
-- `rs_controles` (module « Vérifications »), marquée `origine_externe`.
--
-- Aucun accès direct à la table pour le public : tout passe par deux RPC
-- SECURITY DEFINER qui valident le jeton, bornent les entrées et n'insèrent
-- que dans `rs_controles`. Le lien est révocable (colonne `actif`) et
-- renouvelable depuis le registre.
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================================

alter table public.rs_controles add column if not exists origine_externe boolean not null default false;

create table if not exists public.rs_liens_saisie (
  id          uuid primary key default gen_random_uuid(),
  creche_id   uuid not null,
  token       text not null unique,
  actif       boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists rs_liens_saisie_creche_idx on public.rs_liens_saisie (creche_id) where actif;

alter table public.rs_liens_saisie enable row level security;

drop policy if exists rs_liens_saisie_sel on public.rs_liens_saisie;
create policy rs_liens_saisie_sel on public.rs_liens_saisie
  for select to authenticated using (public.rs_can_write(creche_id));
drop policy if exists rs_liens_saisie_ins on public.rs_liens_saisie;
create policy rs_liens_saisie_ins on public.rs_liens_saisie
  for insert to authenticated with check (public.rs_can_write(creche_id));
drop policy if exists rs_liens_saisie_upd on public.rs_liens_saisie;
create policy rs_liens_saisie_upd on public.rs_liens_saisie
  for update to authenticated using (public.rs_can_write(creche_id)) with check (public.rs_can_write(creche_id));

-- Nom de la crèche affiché sur la page publique (jeton valide uniquement).
create or replace function public.rs_visiteur_info(p_token text)
returns table(creche_nom text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.name
    from public.rs_liens_saisie l
    join public.creches c on c.id = l.creche_id
   where length(coalesce(p_token, '')) >= 20
     and l.token = p_token
     and l.actif
   limit 1;
$$;

-- Dépôt d'un contrôle par l'intervenant.
create or replace function public.rs_visiteur_soumettre(
  p_token text, p_intitule text, p_date date, p_nom text, p_qualite text,
  p_resultat text, p_observations text, p_png text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_creche uuid;
begin
  select l.creche_id into v_creche
    from public.rs_liens_saisie l
   where length(coalesce(p_token, '')) >= 20 and l.token = p_token and l.actif
   limit 1;
  if v_creche is null then return false; end if;

  if coalesce(btrim(p_intitule), '') = '' or coalesce(btrim(p_nom), '') = '' then return false; end if;
  if p_resultat not in ('conforme', 'conforme_reserves', 'non_conforme') then return false; end if;
  if p_date is null or p_date > current_date + 1 or p_date < current_date - 31 then return false; end if;
  if p_png is not null and (p_png !~ '^data:image/png;base64,' or length(p_png) > 400000) then return false; end if;

  insert into public.rs_controles (
    creche_id, libelle_libre, date_controle, organisme, intervenant, resultat,
    observations, signature_url, signataire_nom, signataire_qualite, signe_le, origine_externe)
  values (
    v_creche, left(btrim(p_intitule), 200), p_date, left(nullif(btrim(coalesce(p_qualite, '')), ''), 200),
    left(btrim(p_nom), 200), p_resultat, left(nullif(btrim(coalesce(p_observations, '')), ''), 2000),
    p_png, left(btrim(p_nom), 200), left(nullif(btrim(coalesce(p_qualite, '')), ''), 200),
    case when p_png is null then null else now() end, true);
  return true;
end;
$$;

revoke all on function public.rs_visiteur_info(text) from public;
revoke all on function public.rs_visiteur_soumettre(text, text, date, text, text, text, text, text) from public;
grant execute on function public.rs_visiteur_info(text) to anon, authenticated;
grant execute on function public.rs_visiteur_soumettre(text, text, date, text, text, text, text, text) to anon, authenticated;
