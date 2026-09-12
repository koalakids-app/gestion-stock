-- ============================================================================
-- Lien optionnel entre un·e alternant·e (table stagiaires) et sa fiche
-- collaborateur/trice (table employes).
-- ============================================================================
-- Un·e alternant·e est aussi salarié·e : sans ce lien, sa fiche existe deux
-- fois (stagiaires pour le suivi pédagogique — convention, documents, bilan —
-- et employes pour la paie — planning, pointages, compteur d'heures), sans
-- rapport entre les deux et avec double saisie du prénom/nom/e-mail/crèche.
--
-- `stagiaires.employe_id` référence la fiche employes correspondante. Une
-- fois le lien posé, prénom/nom/e-mail/crèche sont gérés depuis employes
-- (source de vérité) — la fiche stagiaires ne fait plus que refléter la
-- liaison. Une fiche employes ne peut être liée qu'à une seule fiche
-- stagiaires à la fois (index unique).
--
-- Ouvrir "Mon espace" (planning, pointages, compteur d'heures) à un·e
-- alternant·e ne demande aucun développement supplémentaire une fois le lien
-- posé : c'est exactement l'infrastructure déjà en place pour les
-- collaborateurs/trices (cf. sql/collaborateurs_comptes.sql, fonction Edge
-- creer-compte-collaborateur) — il suffit que sa fiche employes ait un
-- compte de connexion.
-- ============================================================================

alter table public.stagiaires
  add column if not exists employe_id uuid references public.employes(id) on delete set null;

create unique index if not exists stagiaires_employe_id_uniq
  on public.stagiaires (employe_id) where employe_id is not null;
