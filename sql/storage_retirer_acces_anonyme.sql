-- ============================================================================
-- Retire l'accès anonyme à TOUS les fichiers du stockage Supabase
-- ============================================================================
-- Constat (audit du coffre-fort) : storage.objects porte huit policies
-- « allow all 1bqp9qb_* » / « allow_all 1bqp9qb_* » (select, insert, update,
-- delete) pour le rôle anon, avec la condition `true` et SANS filtre sur
-- bucket_id. Toute personne munie de la clé publique (visible dans le code
-- des pages) peut donc lister, lire, remplacer et supprimer les fichiers de
-- tous les buckets, y compris `sante`, `stagiaires`, `documents-admin`,
-- `documents-employes` et `carnets`.
--
-- Vérifié dans le dépôt avant de les retirer : les pages publiques
-- (tablette, famille, pièces, stagiaire, signature, préinscription,
-- registre-visiteur, menu) n'utilisent que des URL publiques de buckets
-- publics (assets, menus-repas, guides-parents), qui n'ont pas besoin de
-- policy, ou passent par des edge functions (service role) pour les dépôts.
--
-- À tester juste après : tablette (pictogrammes), page publique du menu,
-- dépôt d'une pièce par une famille et par un stagiaire.
-- ============================================================================

drop policy if exists "allow all 1bqp9qb_0" on storage.objects;
drop policy if exists "allow all 1bqp9qb_1" on storage.objects;
drop policy if exists "allow all 1bqp9qb_2" on storage.objects;
drop policy if exists "allow all 1bqp9qb_3" on storage.objects;
drop policy if exists "allow_all 1bqp9qb_0" on storage.objects;
drop policy if exists "allow_all 1bqp9qb_1" on storage.objects;
drop policy if exists "allow_all 1bqp9qb_2" on storage.objects;
drop policy if exists "allow_all 1bqp9qb_3" on storage.objects;
