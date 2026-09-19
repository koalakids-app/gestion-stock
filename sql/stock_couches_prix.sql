-- ============================================================================
-- Valorisation du stock de couches — prix d'achat unitaire
-- ============================================================================
-- Objectif : afficher la valeur du stock de couches (stock × prix d'achat),
-- sans figer un prix scrapé sur un site grand public qui ne reflète pas
-- forcément le tarif professionnel/collectivité réellement payé.
--
-- Un seul prix par type × taille, partagé par les 6 crèches (catalogue
-- fournisseur unique) plutôt qu'un prix par ligne de stock_couches : plus
-- simple à tenir à jour (6 valeurs, pas 36) et plus proche de la réalité
-- d'achat (un même bon de commande fournisseur pour toutes les structures).
--
-- prix_unitaire est NULL tant que non renseigné : la valorisation d'une
-- taille sans prix connu est simplement omise du total plutôt que comptée
-- comme 0€, pour ne jamais sous-estimer silencieusement le stock.
-- ============================================================================

create table if not exists public.stock_couches_prix (
  type_couche    text not null default 'couche' check (type_couche in ('couche','culotte')),
  taille         text not null check (taille in ('3','4','5','6')),
  prix_unitaire  numeric(6,3),
  updated_at     timestamptz not null default now(),
  primary key (type_couche, taille)
);

alter table public.stock_couches_prix drop constraint if exists stock_couches_prix_type_taille_chk;
alter table public.stock_couches_prix
  add constraint stock_couches_prix_type_taille_chk
  check (type_couche <> 'culotte' or taille in ('4','5'));

alter table public.stock_couches_prix enable row level security;

-- Lecture ouverte à tout le personnel authentifié (la valorisation
-- s'affiche pour tout le monde dans l'onglet Couches).
drop policy if exists stock_couches_prix_select on public.stock_couches_prix;
create policy stock_couches_prix_select on public.stock_couches_prix
  for select to authenticated
  using (true);

-- Écriture réservée à la direction (referents.creche_id null), comme les
-- autres réglages partagés entre crèches (ex. stock_config.creche_name).
drop policy if exists stock_couches_prix_insert on public.stock_couches_prix;
create policy stock_couches_prix_insert on public.stock_couches_prix
  for insert to authenticated
  with check (
    exists (select 1 from public.referents r where r.user_id = auth.uid() and r.creche_id is null)
  );

drop policy if exists stock_couches_prix_update on public.stock_couches_prix;
create policy stock_couches_prix_update on public.stock_couches_prix
  for update to authenticated
  using (
    exists (select 1 from public.referents r where r.user_id = auth.uid() and r.creche_id is null)
  )
  with check (
    exists (select 1 from public.referents r where r.user_id = auth.uid() and r.creche_id is null)
  );

grant select, insert, update on public.stock_couches_prix to authenticated;
