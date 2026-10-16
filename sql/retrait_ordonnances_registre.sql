-- Retrait de l'ordonnance jointe et de l'option « si besoin » du registre d'infirmerie
-- (annule registre_infirmerie_ordonnance.sql et sante_ordonnances_employes.sql).
-- À lancer dans le SQL Editor de Supabase (l'outil MCP expire sur ce SQL).
drop policy if exists sante_ordonnances_employe_insert on storage.objects;
drop policy if exists sante_ordonnances_employe_select on storage.objects;

alter table public.registre_infirmerie
  drop column if exists ordonnance_pj,
  drop column if exists ordonnance_pj_nom,
  drop column if exists si_besoin;
