-- ============================================================================
-- Multi-tenant : reseau_config.id sans défaut, découvert en déroulant la
-- checklist d'onboarding (docs/onboarding-nouvelle-organisation.md)
-- ============================================================================
-- reseau_config.org_id porte déjà une contrainte UNIQUE et une FK vers
-- organisations (fait dans les Parties 1-3) : le cloisonnement multi-tenant
-- lui-même n'a jamais été en cause. Mais `id` (clé primaire) n'avait aucune
-- valeur par défaut — aucun problème tant qu'une seule organisation existait
-- et que sa ligne avait déjà été créée manuellement, mais l'étape 5 de la
-- checklist d'onboarding (créer la ligne reseau_config d'une nouvelle
-- organisation) échouait avec une violation NOT NULL sur `id`.
--
-- Le code applicatif (parametres.html) ne fait jamais d'INSERT sur cette
-- table, seulement des UPDATE sur une ligne supposée déjà exister — la
-- création de la ligne initiale d'une organisation est donc entièrement une
-- étape d'onboarding manuelle, jamais exercée par l'UI avant ce test.
-- ============================================================================

alter table public.reseau_config alter column id set default gen_random_uuid();
