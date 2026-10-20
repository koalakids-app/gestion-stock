-- ============================================================================
-- Recettes des goûters : les référents peuvent créer des recettes
-- ============================================================================
-- À appliquer à la main (SQL Editor, projet juyrceadazrovlitxceb), une
-- instruction à la fois si l'éditeur expire.
--
--  * Un référent crée une recette (created_by = lui) et peut la modifier ou la
--    supprimer ; les recettes des autres restent en lecture seule.
--  * La direction garde tous les droits (policies *_ecriture existantes).
-- ============================================================================

alter table public.recettes add column if not exists created_by uuid default auth.uid();

create policy recettes_referent_ecriture on public.recettes
  for all to authenticated
  using (created_by = auth.uid() and exists (select 1 from public.referents r where r.user_id = auth.uid()))
  with check (created_by = auth.uid() and exists (select 1 from public.referents r where r.user_id = auth.uid()));

create policy recettes_ingredients_referent_ecriture on public.recettes_ingredients
  for all to authenticated
  using (exists (select 1 from public.recettes c where c.id = recette_id and c.created_by = auth.uid()
                 and exists (select 1 from public.referents r where r.user_id = auth.uid())))
  with check (exists (select 1 from public.recettes c where c.id = recette_id and c.created_by = auth.uid()
                 and exists (select 1 from public.referents r where r.user_id = auth.uid())));
