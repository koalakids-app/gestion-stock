-- ============================================================================
-- Étend le registre documents_externes aux stagiaires et alternants
-- ============================================================================
-- Même table que pour enfants/employes (voir sql/documents_externes.sql) :
-- pas d'archive_le/archive_par nécessaire ici, la fiche stagiaire a déjà son
-- propre cycle de vie (statut demande/contact/accepte/en_cours/termine/
-- refuse/annule) et une vue « actives » qui masque déjà les dossiers clos par
-- défaut — inutile de dupliquer ce mécanisme.
-- ============================================================================

alter table public.documents_externes drop constraint if exists documents_externes_entite_type_check;
alter table public.documents_externes
  add constraint documents_externes_entite_type_check
  check (entite_type in ('enfant','employe','stagiaire'));

drop policy if exists documents_externes_select on public.documents_externes;
drop policy if exists documents_externes_insert on public.documents_externes;
drop policy if exists documents_externes_update on public.documents_externes;
drop policy if exists documents_externes_delete on public.documents_externes;

-- stagiaires.creche_id est en `text` (pas uuid comme enfants/employes), d'où
-- le cast explicite ; la portée reprend exactement celle de stagiaires_select
-- (voir table stagiaires) : direction = tout, référente = sa crèche, jamais
-- une stagiaire sans crèche assignée (réservée à la direction).
create policy documents_externes_select on public.documents_externes
  for select to authenticated
  using (
    (documents_externes.entite_type = 'enfant' and exists (
      select 1 from public.enfants e
      join public.referents r on r.user_id = auth.uid()
      where e.id = documents_externes.entite_id
        and (r.creche_id is null or r.creche_id = e.creche_id)
    ))
    or
    (documents_externes.entite_type = 'employe' and exists (
      select 1 from public.employes em
      join public.referents r on r.user_id = auth.uid()
      where em.id = documents_externes.entite_id
        and (r.creche_id is null or r.creche_id = em.creche_id)
    ))
    or
    (documents_externes.entite_type = 'stagiaire' and (
      est_direction() or exists (
        select 1 from public.stagiaires st
        join public.referents r on r.user_id = auth.uid()
        where st.id = documents_externes.entite_id
          and r.role = 'referent' and st.creche_id is not null
          and r.creche_id::text = st.creche_id
      )
    ))
  );

create policy documents_externes_insert on public.documents_externes
  for insert to authenticated
  with check (
    (documents_externes.entite_type = 'enfant' and exists (
      select 1 from public.enfants e
      join public.referents r on r.user_id = auth.uid()
      where e.id = documents_externes.entite_id
        and (r.creche_id is null or r.creche_id = e.creche_id)
    ))
    or
    (documents_externes.entite_type = 'employe' and exists (
      select 1 from public.employes em
      join public.referents r on r.user_id = auth.uid()
      where em.id = documents_externes.entite_id
        and (r.creche_id is null or r.creche_id = em.creche_id)
    ))
    or
    (documents_externes.entite_type = 'stagiaire' and (
      est_direction() or exists (
        select 1 from public.stagiaires st
        join public.referents r on r.user_id = auth.uid()
        where st.id = documents_externes.entite_id
          and r.role = 'referent' and st.creche_id is not null
          and r.creche_id::text = st.creche_id
      )
    ))
  );

create policy documents_externes_update on public.documents_externes
  for update to authenticated
  using (
    (documents_externes.entite_type = 'enfant' and exists (
      select 1 from public.enfants e
      join public.referents r on r.user_id = auth.uid()
      where e.id = documents_externes.entite_id
        and (r.creche_id is null or r.creche_id = e.creche_id)
    ))
    or
    (documents_externes.entite_type = 'employe' and exists (
      select 1 from public.employes em
      join public.referents r on r.user_id = auth.uid()
      where em.id = documents_externes.entite_id
        and (r.creche_id is null or r.creche_id = em.creche_id)
    ))
    or
    (documents_externes.entite_type = 'stagiaire' and (
      est_direction() or exists (
        select 1 from public.stagiaires st
        join public.referents r on r.user_id = auth.uid()
        where st.id = documents_externes.entite_id
          and r.role = 'referent' and st.creche_id is not null
          and r.creche_id::text = st.creche_id
      )
    ))
  )
  with check (
    (documents_externes.entite_type = 'enfant' and exists (
      select 1 from public.enfants e
      join public.referents r on r.user_id = auth.uid()
      where e.id = documents_externes.entite_id
        and (r.creche_id is null or r.creche_id = e.creche_id)
    ))
    or
    (documents_externes.entite_type = 'employe' and exists (
      select 1 from public.employes em
      join public.referents r on r.user_id = auth.uid()
      where em.id = documents_externes.entite_id
        and (r.creche_id is null or r.creche_id = em.creche_id)
    ))
    or
    (documents_externes.entite_type = 'stagiaire' and (
      est_direction() or exists (
        select 1 from public.stagiaires st
        join public.referents r on r.user_id = auth.uid()
        where st.id = documents_externes.entite_id
          and r.role = 'referent' and st.creche_id is not null
          and r.creche_id::text = st.creche_id
      )
    ))
  );

create policy documents_externes_delete on public.documents_externes
  for delete to authenticated
  using (
    (documents_externes.entite_type = 'enfant' and exists (
      select 1 from public.enfants e
      join public.referents r on r.user_id = auth.uid()
      where e.id = documents_externes.entite_id
        and (r.creche_id is null or r.creche_id = e.creche_id)
    ))
    or
    (documents_externes.entite_type = 'employe' and exists (
      select 1 from public.employes em
      join public.referents r on r.user_id = auth.uid()
      where em.id = documents_externes.entite_id
        and (r.creche_id is null or r.creche_id = em.creche_id)
    ))
    or
    (documents_externes.entite_type = 'stagiaire' and (
      est_direction() or exists (
        select 1 from public.stagiaires st
        join public.referents r on r.user_id = auth.uid()
        where st.id = documents_externes.entite_id
          and r.role = 'referent' and st.creche_id is not null
          and r.creche_id::text = st.creche_id
      )
    ))
  );
