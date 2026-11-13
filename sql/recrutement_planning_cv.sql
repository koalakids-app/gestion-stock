-- ============================================================================
-- Recrutement : entretiens reportés dans le calendrier / planning coordinateur,
-- CV et lettre de motivation de la candidate
-- ============================================================================
-- 1) evenements.candidat_id relie l'événement (type « recrutement ») à la fiche :
--    un entretien déplacé met à jour le même événement, un entretien retiré ou une
--    fiche supprimée l'efface. Un seul événement d'entretien par fiche.
-- 2) CV et lettre de motivation importés par l'équipe sur la fiche : fichiers du
--    bucket privé `recrutement` sous <id fiche>/candidature/ (droits déjà couverts
--    par kk_acces_recrutement). Jamais visibles par la personne.
-- À appliquer à la main sur Supabase, après sql/recrutement.sql.
-- ============================================================================
alter table public.evenements
  add column if not exists candidat_id uuid references public.recrutement_candidats(id) on delete cascade;
create unique index if not exists evenements_candidat_id_key
  on public.evenements(candidat_id) where candidat_id is not null;

alter table public.recrutement_candidats
  add column if not exists cv_path text,
  add column if not exists cv_filename text,
  add column if not exists cv_ajoute_le timestamptz,
  add column if not exists lettre_path text,
  add column if not exists lettre_filename text,
  add column if not exists lettre_ajoute_le timestamptz;
