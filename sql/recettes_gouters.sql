-- ============================================================================
-- Recettes des goûters, effectifs par profil et recettes choisies par jour
-- ============================================================================
-- À appliquer à la main (SQL Editor, projet juyrceadazrovlitxceb).
--
--  * recettes / recettes_ingredients : bibliothèque COMMUNE aux crèches, écrite
--    pour `nb_enfants_ref` enfants ; chaque ingrédient porte ses allergènes
--    (codes : gluten, crustaces, oeuf, poisson, arachide, soja, lait,
--    fruits_coque, celeri, moutarde, sesame, sulfites, lupin, mollusques).
--    Lecture : tout référent ; écriture : direction.
--  * gouters_creche_effectifs : nombre d'enfants au goûter par jour, séparés
--    « moyens » (6-18 mois) et « grands » (base du calcul des quantités et du
--    récapitulatif de commande sur 2 semaines).
--  * gouters_creche_recettes : recette choisie pour un jour et un profil.
--    Accès : comme menus_gouters_creche, via kk_acces_creche().
-- ============================================================================

create table if not exists public.recettes (
  id            uuid primary key default gen_random_uuid(),
  nom           text not null check (length(btrim(nom)) > 0 and length(nom) <= 120),
  nb_enfants_ref smallint not null default 10 check (nb_enfants_ref between 1 and 200),
  etapes        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.recettes_ingredients (
  id          uuid primary key default gen_random_uuid(),
  recette_id  uuid not null references public.recettes(id) on delete cascade,
  ordre       smallint not null default 0,
  nom         text not null check (length(btrim(nom)) > 0 and length(nom) <= 120),
  quantite    numeric not null default 0 check (quantite >= 0),
  unite       text not null default 'g' check (unite in ('g','kg','cl','l','pièce','sachet')),
  allergenes  text[] not null default '{}'
);
create index if not exists recettes_ingredients_recette_idx on public.recettes_ingredients (recette_id, ordre);

alter table public.recettes enable row level security;
alter table public.recettes_ingredients enable row level security;

create policy recettes_select on public.recettes
  for select to authenticated
  using (exists (select 1 from public.referents r where r.user_id = auth.uid()));
create policy recettes_ecriture on public.recettes
  for all to authenticated
  using (public.kk_est_direction()) with check (public.kk_est_direction());

create policy recettes_ingredients_select on public.recettes_ingredients
  for select to authenticated
  using (exists (select 1 from public.referents r where r.user_id = auth.uid()));
create policy recettes_ingredients_ecriture on public.recettes_ingredients
  for all to authenticated
  using (public.kk_est_direction()) with check (public.kk_est_direction());

create table if not exists public.gouters_creche_effectifs (
  creche_id   uuid not null references public.creches(id) on delete cascade,
  date_debut  date not null,
  jour        smallint not null check (jour between 1 and 5),
  moyens      smallint not null default 0 check (moyens between 0 and 99),
  grands      smallint not null default 0 check (grands between 0 and 99),
  updated_at  timestamptz not null default now(),
  primary key (creche_id, date_debut, jour)
);

create table if not exists public.gouters_creche_recettes (
  creche_id   uuid not null references public.creches(id) on delete cascade,
  date_debut  date not null,
  jour        smallint not null check (jour between 1 and 5),
  profil      text not null check (profil in ('moyen','grand')),
  recette_id  uuid not null references public.recettes(id) on delete cascade,
  primary key (creche_id, date_debut, jour, profil, recette_id)
);

do $$
declare t text;
begin
  foreach t in array array['gouters_creche_effectifs','gouters_creche_recettes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.kk_acces_creche(creche_id)) with check (public.kk_acces_creche(creche_id))', t || '_acces', t);
  end loop;
end $$;
