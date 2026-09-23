-- ============================================================================
-- Registre des documents conservés sur support externe (papier, coffre-fort,
-- classeur RH...) liés à un enfant ou un employé.
-- ============================================================================
-- Ne stocke aucun fichier : juste la trace qu'une pièce existe, où elle est
-- physiquement conservée, et depuis quand — pour les pièces qu'on ne
-- numérise pas (ex. extrait de casier judiciaire, à ne pas conserver après
-- vérification).
-- ============================================================================

create table if not exists public.documents_externes (
  id                     uuid primary key default gen_random_uuid(),
  entite_type            text not null check (entite_type in ('enfant','employe')),
  entite_id              uuid not null,
  libelle                text not null,
  support                text not null default 'papier'
                           check (support in ('papier','coffre-fort','classeur','autre')),
  lieu_conservation      text,
  categorie              text not null default 'autre'
                           check (categorie in ('identite','sante','comptable','rh','autre')),
  date_depot             date not null default current_date,
  date_destruction_prevue date,
  detruit_le             date,
  detruit_par            uuid references auth.users(id),
  notes                  text,
  created_by             uuid references auth.users(id),
  created_at             timestamptz not null default now()
);

create index if not exists documents_externes_entite_idx
  on public.documents_externes (entite_type, entite_id);

-- ----------------------------------------------------------------------------
-- Calcul automatique de date_destruction_prevue si non renseignée, selon la
-- catégorie de pièce : santé = pas de rétention (à détruire/restituer dès le
-- dépôt), comptable = 10 ans (art. L123-22 code de commerce), le reste = 5
-- ans (prescription contractuelle / documents RH).
-- ----------------------------------------------------------------------------
create or replace function public.kk_documents_externes_calc_purge()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.date_destruction_prevue is null then
    new.date_destruction_prevue := case new.categorie
      when 'sante' then new.date_depot
      when 'comptable' then new.date_depot + interval '10 years'
      else new.date_depot + interval '5 years'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists documents_externes_calc_purge on public.documents_externes;
create trigger documents_externes_calc_purge
  before insert on public.documents_externes
  for each row execute function public.kk_documents_externes_calc_purge();

alter table public.documents_externes enable row level security;

-- Même portée que les autres tables liées à un enfant/employé : direction =
-- tout, référente = sa crèche uniquement, jamais d'accès anonyme. Le type
-- étant polymorphe (enfant ou employe), la portée se vérifie sur la bonne
-- table selon entite_type.
create policy documents_externes_select on public.documents_externes
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (
          (documents_externes.entite_type = 'enfant' and exists (
            select 1 from public.enfants e
            where e.id = documents_externes.entite_id
              and (r.creche_id is null or r.creche_id = e.creche_id)
          ))
          or
          (documents_externes.entite_type = 'employe' and exists (
            select 1 from public.employes em
            where em.id = documents_externes.entite_id
              and (r.creche_id is null or r.creche_id = em.creche_id)
          ))
        )
    )
  );

create policy documents_externes_insert on public.documents_externes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (
          (documents_externes.entite_type = 'enfant' and exists (
            select 1 from public.enfants e
            where e.id = documents_externes.entite_id
              and (r.creche_id is null or r.creche_id = e.creche_id)
          ))
          or
          (documents_externes.entite_type = 'employe' and exists (
            select 1 from public.employes em
            where em.id = documents_externes.entite_id
              and (r.creche_id is null or r.creche_id = em.creche_id)
          ))
        )
    )
  );

create policy documents_externes_update on public.documents_externes
  for update to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (
          (documents_externes.entite_type = 'enfant' and exists (
            select 1 from public.enfants e
            where e.id = documents_externes.entite_id
              and (r.creche_id is null or r.creche_id = e.creche_id)
          ))
          or
          (documents_externes.entite_type = 'employe' and exists (
            select 1 from public.employes em
            where em.id = documents_externes.entite_id
              and (r.creche_id is null or r.creche_id = em.creche_id)
          ))
        )
    )
  )
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (
          (documents_externes.entite_type = 'enfant' and exists (
            select 1 from public.enfants e
            where e.id = documents_externes.entite_id
              and (r.creche_id is null or r.creche_id = e.creche_id)
          ))
          or
          (documents_externes.entite_type = 'employe' and exists (
            select 1 from public.employes em
            where em.id = documents_externes.entite_id
              and (r.creche_id is null or r.creche_id = em.creche_id)
          ))
        )
    )
  );

create policy documents_externes_delete on public.documents_externes
  for delete to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (
          (documents_externes.entite_type = 'enfant' and exists (
            select 1 from public.enfants e
            where e.id = documents_externes.entite_id
              and (r.creche_id is null or r.creche_id = e.creche_id)
          ))
          or
          (documents_externes.entite_type = 'employe' and exists (
            select 1 from public.employes em
            where em.id = documents_externes.entite_id
              and (r.creche_id is null or r.creche_id = em.creche_id)
          ))
        )
    )
  );
