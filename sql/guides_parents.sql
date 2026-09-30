-- ============================================================================
-- Guides pour les parents : trame à remplir en ligne (onglet « Guides parents » de documents.html) et page de
-- lecture publique par lien (guide.html)
-- ============================================================================
-- Reprend le principe des micro-formations (quiz-protocoles) : un guide est
-- une suite ordonnée de blocs typés (section, question/réponse, texte,
-- citation, image), stockés en JSON pour rester extensibles sans migration.
--
-- Écriture : toute personne connue dans `referents` de l'organisation
-- (direction et directrices techniques). Lecture publique : uniquement via la
-- fonction kk_guide_public(), qui ne renvoie que les guides publiés — jamais
-- d'accès anonyme direct aux tables (même principe que kk_resultats_par_ref).
-- Appliqué sur le projet Supabase de gestion-stock (migration guides_parents).
-- ============================================================================

create table if not exists public.guides_parents (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id),
  titre       text not null,
  sous_titre  text,                       -- ex. « Les réponses aux questions que les parents se posent »
  structure   text,                       -- nom affiché : « la crèche », « Koala Kids »…
  accueil     text,                       -- encadré « Un livret pour échanger »
  intro       text,                       -- paragraphes d'introduction (retours à la ligne conservés)
  conclusion  text,                       -- remerciements / mot de fin
  signature   text,                       -- ex. « L'équipe Koala Kids !!! »
  publie      boolean not null default false,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.guides_parents_blocs (
  id        uuid primary key default gen_random_uuid(),
  guide_id  uuid not null references public.guides_parents(id) on delete cascade,
  org_id    uuid not null references public.organisations(id),
  ordre     int  not null default 0,
  type      text not null check (type in ('section','qr','texte','citation','image')),
  contenu   jsonb not null default '{}'::jsonb
);

create index if not exists guides_parents_blocs_guide_idx
  on public.guides_parents_blocs (guide_id, ordre);

-- org_id résolu côté base (le front ne l'envoie jamais), comme les autres tables.
drop trigger if exists trg_guides_parents_set_org_id on public.guides_parents;
create trigger trg_guides_parents_set_org_id
  before insert on public.guides_parents
  for each row execute function public.set_org_id_from_session();

drop trigger if exists trg_guides_parents_blocs_set_org_id on public.guides_parents_blocs;
create trigger trg_guides_parents_blocs_set_org_id
  before insert on public.guides_parents_blocs
  for each row execute function public.set_org_id_from_session();

create or replace function public.kk_guides_parents_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guides_parents_touch on public.guides_parents;
create trigger trg_guides_parents_touch
  before update on public.guides_parents
  for each row execute function public.kk_guides_parents_touch();

alter table public.guides_parents enable row level security;
alter table public.guides_parents_blocs enable row level security;

create policy guides_parents_staff on public.guides_parents
  for all to authenticated
  using (
    org_id = public.kk_mon_org()
    and exists (select 1 from public.referents r where r.user_id = auth.uid())
  )
  with check (
    org_id = public.kk_mon_org()
    and exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy guides_parents_blocs_staff on public.guides_parents_blocs
  for all to authenticated
  using (
    org_id = public.kk_mon_org()
    and exists (select 1 from public.referents r where r.user_id = auth.uid())
  )
  with check (
    org_id = public.kk_mon_org()
    and exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- Lecture publique par lien : un guide publié, et lui seul, avec ses blocs.
-- ----------------------------------------------------------------------------
create or replace function public.kk_guide_public(p_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'guide', to_jsonb(g) - 'org_id' - 'created_by',
    'blocs', coalesce((
      select jsonb_agg(jsonb_build_object('type', b.type, 'contenu', b.contenu) order by b.ordre)
      from public.guides_parents_blocs b
      where b.guide_id = g.id
    ), '[]'::jsonb)
  )
  from public.guides_parents g
  where g.id = p_id and g.publie
$$;

revoke all on function public.kk_guide_public(uuid) from public;
grant execute on function public.kk_guide_public(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Images des guides : bucket public en lecture (les parents voient les images
-- du guide publié), dépôt/suppression réservés au personnel connecté.
-- Chemin : <guide_id>/<fichier>
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('guides-parents', 'guides-parents', true)
on conflict (id) do nothing;

create policy guides_parents_img_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'guides-parents'
    and exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy guides_parents_img_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'guides-parents'
    and exists (select 1 from public.referents r where r.user_id = auth.uid())
  );
