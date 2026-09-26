-- ============================================================================
-- Nature du contrat de travail — apprentissage / professionnalisation
-- ============================================================================
-- sql/employes_contrat_travail.sql posait `type_contrat` (CDI / CDD), qui
-- décrit la DURÉE du contrat. Un contrat d'apprentissage ou de
-- professionnalisation peut être conclu en CDD (le cas le plus courant) ou en
-- CDI (« CDI apprentissage » depuis la loi Avenir professionnel de 2018,
-- « CDI de professionnalisation » pour les périodes de professionnalisation
-- initiales) : ce n'est pas une troisième valeur de `type_contrat`, mais une
-- caractéristique supplémentaire portée par un champ distinct.
--
-- `nature_contrat` reste donc orthogonal à `type_contrat` :
--   - standard          : contrat de travail « classique » (CDI ou CDD)
--   - apprentissage      : contrat d'apprentissage (CAP AEPE, titre pro AEPE…)
--   - professionnalisation : contrat de professionnalisation (reconversion,
--                            voie du titre IEPE — décret n°2025-1207)
--
-- Comme pour employes_contrat_travail.sql : uniquement les colonnes, nullable,
-- aucune génération de document ici. Le moteur de génération (documents.html,
-- modèle contrat_travail) lit ces champs pour adapter les clauses.
-- ============================================================================

alter table public.employes add column if not exists nature_contrat text;
alter table public.employes add column if not exists diplome_vise text;
alter table public.employes add column if not exists organisme_formation text;
alter table public.employes add column if not exists duree_formation_heures numeric;
alter table public.employes add column if not exists date_debut_formation date;
alter table public.employes add column if not exists date_fin_formation date;
alter table public.employes add column if not exists tuteur_nom text;
alter table public.employes add column if not exists tuteur_qualite text;
alter table public.employes add column if not exists opco text;

alter table public.employes drop constraint if exists employes_nature_contrat_check;
alter table public.employes
  add constraint employes_nature_contrat_check
  check (nature_contrat is null or nature_contrat in ('standard','apprentissage','professionnalisation'));

comment on column public.employes.nature_contrat is
  'Nature du contrat, orthogonale à type_contrat (CDI/CDD) : standard | apprentissage | professionnalisation. '
  'Un contrat d''apprentissage ou de professionnalisation reste par ailleurs un CDD ou un CDI.';
comment on column public.employes.diplome_vise is
  'Diplôme ou titre visé par la formation (ex. CAP AEPE, titre pro AEPE, titre IEPE — décret n°2025-1207).';
comment on column public.employes.tuteur_nom is
  'Maître d''apprentissage (contrat d''apprentissage) ou tuteur (contrat de professionnalisation).';

-- ⚠️ Pas de grille de salaire codée en dur : la rémunération d'un(e)
-- apprenti(e) (% du SMIC selon l'âge et l'année du contrat) et celle d'un(e)
-- salarié(e) en contrat de professionnalisation (% du SMIC ou du minimum
-- conventionnel selon l'âge et le niveau de qualification) sont fixées par la
-- loi et par la CCN SAP (IDCC 3127), et révisées régulièrement — à calculer
-- et faire vérifier par un professionnel avant chaque embauche, jamais codées
-- en dur dans l'application. `salaire_brut` (existant sur `employes`) reste
-- le champ où la référente saisit le montant retenu, une fois vérifié.
