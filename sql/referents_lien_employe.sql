-- ============================================================================
-- Lien optionnel entre un directeur/trice technique (table referents) et sa
-- fiche collaborateur/trice (table employes).
-- ============================================================================
-- Même principe que sql/stagiaires_lien_employe.sql, pour la même raison :
-- une directrice technique est aussi salariée, suivie une seconde fois dans
-- `employes` pour son contrat (type de contrat, heures hebdo, dates) — sans
-- ce lien, elle a deux fiches sans rapport entre elles, et deux tuiles dans
-- le mode kiosque (une par table).
--
-- `referents.employe_id` référence la fiche employes correspondante. Une
-- fois le lien posé :
--   - le contrat (type_contrat, heures_hebdo, date_debut, date_fin) reste
--     porté par la fiche employes, affiché en plus sur la fiche referents ;
--   - le mode kiosque n'affiche plus qu'une seule tuile (celle du
--     directeur/trice technique) et le pointage est enregistré sur
--     employes.id (pointages.employe_id), pour que son compteur d'heures
--     (déjà basé sur pointages.employe_id, cf. empHeuresLigne côté
--     js/enfants.js) continue de fonctionner sans changement.
-- Une fiche employes ne peut être liée qu'à une seule fiche referents à la
-- fois (index unique), même contrainte que côté stagiaires.
-- ============================================================================

alter table public.referents
  add column if not exists employe_id uuid references public.employes(id) on delete set null;

create unique index if not exists referents_employe_id_uniq
  on public.referents (employe_id) where employe_id is not null;
