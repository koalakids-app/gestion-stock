-- ============================================================================
-- Fiche employé — champs nécessaires à la création d'un contrat de travail
-- ============================================================================
-- Uniquement les colonnes : pas de génération de document dans cette étape.
-- Toutes nullable — une fiche existante reste valide tant que ces champs ne
-- sont pas renseignés, à compléter au moment de l'embauche.
-- ============================================================================

-- État civil
alter table public.employes add column if not exists date_naissance date;
alter table public.employes add column if not exists lieu_naissance text;
alter table public.employes add column if not exists nationalite text;
alter table public.employes add column if not exists numero_secu text;
alter table public.employes add column if not exists adresse text;
alter table public.employes add column if not exists telephone text;

-- Contrat de travail
alter table public.employes add column if not exists type_contrat text;
alter table public.employes add column if not exists date_debut date;
alter table public.employes add column if not exists date_fin date;
alter table public.employes add column if not exists motif_cdd text;
alter table public.employes add column if not exists periode_essai text;
alter table public.employes add column if not exists temps_travail text;
alter table public.employes add column if not exists heures_hebdo numeric;
alter table public.employes add column if not exists qualification text;
alter table public.employes add column if not exists convention_collective text;
alter table public.employes add column if not exists coefficient text;
alter table public.employes add column if not exists salaire_brut numeric;
alter table public.employes add column if not exists lieu_travail text;

alter table public.employes drop constraint if exists employes_type_contrat_check;
alter table public.employes
  add constraint employes_type_contrat_check
  check (type_contrat is null or type_contrat in ('CDI','CDD'));

alter table public.employes drop constraint if exists employes_temps_travail_check;
alter table public.employes
  add constraint employes_temps_travail_check
  check (temps_travail is null or temps_travail in ('temps_plein','temps_partiel'));
