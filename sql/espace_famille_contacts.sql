-- ============================================================================
-- Espace famille : contacts affichés aux familles
-- ============================================================================
-- Coordonnées de la crèche (etablissements.telephone / email / adresse_siege, déjà saisies dans
-- Paramètres) + personnes à contacter :
--   - par crèche   : etablissements.contacts_famille (directeur / directrice…)
--   - pour le réseau : reseau_config.config.contacts_famille_reseau (coordinateur, gestionnaire…),
--     jsonb libre, aucune migration.
-- Chaque entrée : { "role": "directeur|coordinateur|gestionnaire|autre", "nom": "…", "fonction": "…",
--                   "telephone": "…", "email": "…" }
-- Saisie par la direction dans Paramètres › Les établissements. Rien n'est publié tant qu'elle n'a
-- pas ajouté de contact. À appliquer à la main.
-- ============================================================================
alter table public.etablissements
  add column if not exists contacts_famille jsonb not null default '[]'::jsonb;
