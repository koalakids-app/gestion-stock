-- ============================================================================
-- Multi-tenant : reunions_direction.org_id sans trigger, découvert via la
-- surveillance post-déploiement (échec visible côté utilisateur le 29/09/2026)
-- ============================================================================
-- 4e occurrence du même anti-pattern (après reseau_config.id, frais_ik_config.id,
-- fournisseurs.org_id, evenements/documents_reponses.org_id) : org_id est
-- NOT NULL sans défaut, et js/reunions-direction.js
-- (sb.from('reunions_direction').upsert(row,{onConflict:'date_reunion'}))
-- ne le fournit jamais à l'insertion d'un nouveau compte-rendu.
--
-- Conséquence réelle : 2 échecs le 29/09/2026 à 14h12 UTC, avec le message
-- "Enregistrement refusé : new row violates row-level security policy for
-- table "reunions_direction"" — la policy reunions_direction_write exige
-- org_id = kk_mon_org(), qu'une valeur NULL ne peut jamais satisfaire.
--
-- Utilise la fonction mutualisée public.set_org_id_from_session() (créée
-- pour evenements/documents_reponses, cf.
-- sql/evenements_documents_reponses_set_org_id_trigger.sql), qui résout
-- org_id via kk_mon_org() si absent sans jamais écraser une valeur fournie.
--
-- Appliqué en prod le 29/09/2026.
-- ============================================================================

create trigger trg_reunions_direction_set_org_id
before insert on public.reunions_direction
for each row execute function public.set_org_id_from_session();
