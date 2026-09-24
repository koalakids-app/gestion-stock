-- ============================================================================
-- Menus de la semaine (traiteur), affichés sur Présences > Semaine
-- ============================================================================
-- Un menu commun à tout le réseau (pas de colonne crèche : toutes les crèches
-- reçoivent le même menu traiteur). Une ligne par jour de semaine (lundi à
-- vendredi), avec les 3 profils du bon de commande traiteur — pas les 5
-- tranches d'âge de la fiche enfant : le menu vient du traiteur, qui ne
-- distingue que « Bébés − de 6 mois », « Bébés 6-18 mois » et « Grands 18
-- mois-3 ans » (mêmes catégories que bb6/bb18/grand sur le bon de commande,
-- voir mcmLigne() dans demandes.html).
--
-- `bb6`, `bb18`, `grand` (jsonb) : tableau de lignes de texte dans l'ordre
-- où le traiteur les présente pour ce profil, par ex. pour bb18 :
--   ["Poisson poché", "", "Purée de brocoli", "purée de fruit"]
-- (la 2e ligne, souvent une viande/poisson alternative, peut être vide).
-- `bb18_gouter` / `grand_gouter` : le goûter du jour, en texte libre (les
-- bébés de moins de 6 mois n'ont pas de goûter, cf. enfGouterAuto()).
-- `theme` : thème de la semaine ou du jour affiché par le traiteur au-dessus
-- du repas des grands (ex. « SEMAINE DU GOÛT », « HALLOWEEN »), facultatif.
--
-- Importé depuis le tableau Excel hebdomadaire du traiteur (un onglet par
-- semaine) via le bouton d'import de l'écran direction — voir menusSemaine*
-- dans demandes.html.
-- ============================================================================

create table if not exists public.menus_semaine (
  id            uuid primary key default gen_random_uuid(),
  date_debut    date not null,               -- lundi de la semaine concernée
  semaine_num   int,                          -- numéro de semaine ISO (information seulement)
  jour          smallint not null check (jour between 1 and 5),  -- 1 = lundi … 5 = vendredi
  theme         text,
  bb6           jsonb not null default '[]'::jsonb,
  bb18          jsonb not null default '[]'::jsonb,
  bb18_gouter   text,
  grand         jsonb not null default '[]'::jsonb,
  grand_gouter  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  unique (date_debut, jour)
);

create index if not exists menus_semaine_date_debut_idx
  on public.menus_semaine (date_debut);

alter table public.menus_semaine enable row level security;

-- Lecture ouverte à tout référent authentifié (direction ou directrice
-- technique) : le menu de la semaine est une information partagée par toute
-- l'équipe, pas une donnée sensible.
create policy menus_semaine_select on public.menus_semaine
  for select to authenticated
  using (
    exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

-- Écriture (import) laissée ouverte à tout référent en base ; le bouton
-- d'import lui-même est réservé à la direction côté écran (isDirection),
-- même principe que la grille de tarifs repas.
create policy menus_semaine_insert on public.menus_semaine
  for insert to authenticated
  with check (
    exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy menus_semaine_update on public.menus_semaine
  for update to authenticated
  using (
    exists (select 1 from public.referents r where r.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy menus_semaine_delete on public.menus_semaine
  for delete to authenticated
  using (
    exists (select 1 from public.referents r where r.user_id = auth.uid())
  );
