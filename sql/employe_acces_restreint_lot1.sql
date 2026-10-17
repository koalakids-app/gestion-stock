-- ============================================================================
-- Rôle « employe » : retirer l'accès aux tables sensibles (lot 1)
-- ============================================================================
-- kk_acces_creche(creche_id) est vrai pour tout profil `referents` de la
-- crèche, rôle `employe` compris. Un(e) employé(e) pouvait donc lire (et
-- parfois écrire) par l'API des données qui ne le concernent pas, même si les
-- pages lui sont fermées. On bascule ces règles sur kk_acces_creche_gestion
-- (direction + referent seulement, cf. sql/planning_equipe_employe_restreint.sql,
-- à appliquer avant).
--
-- Inchangé volontairement :
--   * employes_select_self : l'employé(e) lit toujours sa propre fiche
--     (Mon espace, support-chat) ;
--   * enfants : déjà limité à referent/direction (enf_read, direction_all_enfants) ;
--   * tables du terrain : registre_infirmerie, pai, vaccinations, pointages,
--     planning, kiosk_devices, documents_koala, goûters/menus de crèche,
--     enfants_absences et enfants_contrats (lus par presences-reel.js) — à traiter au lot 2 après
--     test avec un compte employé.
--
-- Lot 1 — tables sans usage côté employé :
--   personnel   : employes, employes_documents, dossiers_pieces_employe
--   enfants     : dossiers_pieces, enfants_documents_admin
--   contrats    : contrats, contrats_lignes, contrats_preuves
--   suivi       : suivi_observations, suivi_saisies, suivi_syntheses,
--                 suivi_acces_famille, suivi_consultations
--   gestion     : controles_eaje, archivage_purges, reunions_equipe,
--                 remplacantes (lecture)
--
-- Procédé : ALTER POLICY (pas de DROP : sur ces tables le DROP/CREATE a déjà
-- dépassé les 60 s de l'outil MCP) ; chaque règle garde son texte, seul
-- l'appel kk_acces_creche( devient kk_acces_creche_gestion(.
-- À appliquer à la main sur Supabase, puis tester :
--   1. compte employé (ex. compte de test) : plus de lignes sur ces tables ;
--   2. compte referent et direction : tout fonctionne comme avant.
-- ============================================================================

do $$
declare
  r record;
  q text;
  w text;
  sql text;
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'employes','employes_documents','dossiers_pieces_employe',
        'dossiers_pieces','enfants_documents_admin',
        'contrats','contrats_lignes','contrats_preuves',
        'suivi_observations','suivi_saisies','suivi_syntheses',
        'suivi_acces_famille','suivi_consultations',
        'controles_eaje','archivage_purges','reunions_equipe','remplacantes'
      )
      and (qual ilike '%kk_acces_creche(%' or with_check ilike '%kk_acces_creche(%')
  loop
    q := replace(r.qual, 'kk_acces_creche(', 'kk_acces_creche_gestion(');
    w := replace(r.with_check, 'kk_acces_creche(', 'kk_acces_creche_gestion(');
    sql := format('alter policy %I on public.%I', r.policyname, r.tablename);
    if q is not null then sql := sql || ' using (' || q || ')'; end if;
    if w is not null then sql := sql || ' with check (' || w || ')'; end if;
    execute sql;
  end loop;
end $$;

-- Retour arrière (si besoin) : même bloc avec le replace inversé
--   (kk_acces_creche_gestion( -> kk_acces_creche( ) sur les mêmes tables.
