-- ============================================================================
-- Mur des candidatures : colonnes par crèche et commentaires (comme le Padlet)
-- ============================================================================
-- Suite de sql/stagiaires_candidatures.sql. Le mur est un tableau : une colonne
-- « Demandes reçues » (statut 'ouverte') puis une colonne par crèche
-- (statut 'attribuee', attribuee_creche = id de la crèche). Un·e référent·e
-- « se positionne » en déplaçant la carte dans la colonne de SA crèche ; la
-- direction déplace n'importe quelle carte. Chacun commente les cartes.
--   - stagiaires_candidatures_commentaires : les commentaires d'une carte ;
--   - kk_vivier_deplacer(id, crèche)       : déplacement contrôlé (SECURITY DEFINER) ;
--   - kk_vivier_lier_fiche(id, fiche)      : garde la fiche stagiaire créée depuis la carte.
-- La table stagiaires_candidatures_interets (premier modèle « je me positionne »)
-- n'est plus utilisée par l'application ; elle reste vide.
-- À appliquer à la main sur Supabase, une partie à la fois.
-- ============================================================================

-- ---- Partie 1 : commentaires ----------------------------------------------
create table if not exists public.stagiaires_candidatures_commentaires (
  id             uuid primary key default gen_random_uuid(),
  candidature_id uuid not null references public.stagiaires_candidatures(id) on delete cascade,
  auteur_id      uuid references public.referents(id) on delete set null,
  auteur_nom     text,
  texte          text not null check (length(texte) between 1 and 1000),
  created_at     timestamptz not null default now()
);
create index if not exists stagiaires_cand_comm_idx on public.stagiaires_candidatures_commentaires(candidature_id, created_at);
alter table public.stagiaires_candidatures_commentaires enable row level security;

create policy stagiaires_cand_comm_select on public.stagiaires_candidatures_commentaires
  for select to authenticated using (exists (
    select 1 from public.stagiaires_candidatures c
    where c.id = candidature_id and public.kk_vivier_acces(c.org_id)));

create policy stagiaires_cand_comm_insert on public.stagiaires_candidatures_commentaires
  for insert to authenticated with check (
    exists (select 1 from public.referents r
            where r.id = auteur_id and r.user_id = auth.uid() and r.role in ('direction','referent'))
    and exists (select 1 from public.stagiaires_candidatures c
                where c.id = candidature_id and public.kk_vivier_acces(c.org_id)));

create policy stagiaires_cand_comm_delete on public.stagiaires_candidatures_commentaires
  for delete to authenticated using (
    public.est_direction()
    or exists (select 1 from public.referents r where r.id = auteur_id and r.user_id = auth.uid()));

-- ---- Partie 2 : déplacement d'une carte -----------------------------------
create or replace function public.kk_vivier_deplacer(p_id uuid, p_creche text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c public.stagiaires_candidatures%rowtype;
  r public.referents%rowtype;
begin
  select * into c from public.stagiaires_candidatures where id = p_id;
  if not found then raise exception 'Candidature introuvable'; end if;
  select * into r from public.referents
    where user_id = auth.uid() and role in ('direction','referent') and org_id = c.org_id
    limit 1;
  if not found then raise exception 'Accès refusé'; end if;
  if p_creche is not null and not exists (
      select 1 from public.creches where id::text = p_creche and org_id = c.org_id) then
    raise exception 'Crèche inconnue';
  end if;
  if r.role = 'referent' then
    if c.statut = 'classee' then raise exception 'Candidature classée'; end if;
    if p_creche is not null and p_creche <> r.creche_id::text then
      raise exception 'Vous ne pouvez déplacer une carte que dans la colonne de votre crèche';
    end if;
    if p_creche is null and coalesce(c.attribuee_creche, '') <> r.creche_id::text then
      raise exception 'Cette carte n''est pas dans votre crèche';
    end if;
    if p_creche is not null and c.statut = 'attribuee' and c.attribuee_creche <> p_creche then
      raise exception 'Candidature déjà prise par une autre crèche';
    end if;
  end if;
  update public.stagiaires_candidatures
     set statut = case when p_creche is null then 'ouverte' else 'attribuee' end,
         attribuee_creche = p_creche,
         attribuee_referent = case when p_creche is null then null else r.id end
   where id = p_id;
end;
$$;
revoke all on function public.kk_vivier_deplacer(uuid, text) from public, anon;
grant execute on function public.kk_vivier_deplacer(uuid, text) to authenticated;

-- ---- Partie 3 : fiche stagiaire créée depuis la carte ---------------------
create or replace function public.kk_vivier_lier_fiche(p_id uuid, p_fiche uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c public.stagiaires_candidatures%rowtype;
  r public.referents%rowtype;
begin
  select * into c from public.stagiaires_candidatures where id = p_id;
  if not found then raise exception 'Candidature introuvable'; end if;
  select * into r from public.referents
    where user_id = auth.uid() and role in ('direction','referent') and org_id = c.org_id
    limit 1;
  if not found then raise exception 'Accès refusé'; end if;
  if r.role = 'referent' and coalesce(c.attribuee_creche, '') <> r.creche_id::text then
    raise exception 'Cette carte n''est pas dans votre crèche';
  end if;
  update public.stagiaires_candidatures set stagiaire_id = p_fiche where id = p_id;
end;
$$;
revoke all on function public.kk_vivier_lier_fiche(uuid, uuid) from public, anon;
grant execute on function public.kk_vivier_lier_fiche(uuid, uuid) to authenticated;
