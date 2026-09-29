-- ============================================================================
-- Multi-tenant : fournisseurs.org_id sans trigger, découvert via la
-- surveillance post-déploiement (3 échecs d'insertion RLS le 27/09/2026)
-- ============================================================================
-- fournisseurs.org_id est NOT NULL (Parties 1-3) et la policy RLS
-- fournisseurs_stock_access exige `org_id = kk_mon_org()`, mais rien ne
-- renseignait org_id à l'insertion : le front (stock.html) n'envoie jamais
-- ce champ, en confiance que la base s'en charge — ce qu'elle ne faisait pas
-- pour cette table. Conséquence réelle : 3 tentatives d'ajout de fournisseur
-- ont échoué en silence côté base (erreur RLS 42501) entre 07h17 et 08h31
-- UTC le 27/09/2026, avant ce correctif.
--
-- Même classe de bug que reseau_config.id et frais_ik_config.id (session du
-- 26/09/2026) : un champ obligatoire côté schéma que le code applicatif ne
-- pose jamais, découvert seulement quand quelqu'un déclenche le chemin qui
-- en a besoin.
--
-- Corrigé par un trigger BEFORE INSERT (plutôt qu'un DEFAULT, org_id n'étant
-- pas déductible d'une constante mais de la session de l'appelant·e) qui
-- reprend le même principe que kk_mon_org() : résoudre l'organisation via la
-- fiche `referents` de la personne connectée, sans jamais écraser une valeur
-- déjà fournie.
--
-- Appliqué directement en prod le 27/09/2026 (hors session Claude Code —
-- dashboard Supabase), documenté ici après coup pour traçabilité.
--
-- MISE À JOUR 29/09/2026 : le même bug a ensuite été retrouvé sur
-- evenements.org_id et documents_reponses.org_id (voir
-- sql/evenements_documents_reponses_set_org_id_trigger.sql), avec la même
-- fonction de trigger à la virgule près. Pour éviter trois fonctions
-- identiques, ce trigger a été basculé sur la fonction mutualisée
-- public.set_org_id_from_session() et l'ancienne fonction
-- fournisseurs_set_org_id() a été supprimée.
-- ============================================================================

create trigger trg_fournisseurs_set_org_id
before insert on public.fournisseurs
for each row execute function public.set_org_id_from_session();
