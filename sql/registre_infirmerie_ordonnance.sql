-- Registre d'infirmerie : ordonnance du médecin en pièce jointe + traitement « si besoin ».
-- À appliquer à la main sur Supabase (projet juyrceadazrovlitxceb).
-- Le fichier est dans le bucket privé `sante` (dossier `ordonnances/`), mêmes policies que les PAI.
alter table public.registre_infirmerie
  add column if not exists ordonnance_pj     text,
  add column if not exists ordonnance_pj_nom text,
  add column if not exists si_besoin         boolean not null default false;
