-- Album photos : détection des doublons à l'ajout.
-- À appliquer à la main (après album_photos.sql).
--
-- `empreinte` = SHA-256 du fichier d'origine (calculé dans le navigateur avant la
-- réduction). Les photos ajoutées avant ce script n'en ont pas (colonne vide) et ne
-- sont donc pas comparées. Pas de contrainte d'unicité : le doublon est signalé à
-- l'ajout et la personne peut choisir de l'ajouter quand même.

alter table public.album_photos add column if not exists empreinte text;

create index if not exists album_photos_empreinte_idx
  on public.album_photos (creche_id, empreinte)
  where empreinte is not null;
