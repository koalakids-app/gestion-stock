-- ============================================================================
-- Rôle « employe » : retirer l'accès aux tables du terrain inutiles (lot 2)
-- ============================================================================
-- Suite de sql/employe_acces_restreint_lot1.sql (même procédé : ALTER POLICY,
-- kk_acces_creche( -> kk_acces_creche_gestion( dans le texte de la règle).
-- Prérequis : sql/planning_equipe_employe_restreint.sql (fonction
-- kk_acces_creche_gestion).
--
-- Fermées aux employés (aucun écran employé ne les utilise) :
--   enfants_absences, enfants_contrats, enfants_pai, documents_reponses_preuves,
--   gouters_creche_effectifs, gouters_creche_options, gouters_creche_recettes,
--   menus_gouters_creche
--   planning        : les lignes des autres ; l'employé garde les siennes
--                     (clause referent_id = son id, inchangée)
--   frais_pro, frais_pro_pdf : les notes de frais des collègues ; les siennes
--                     restent accessibles (clause person_id, inchangée)
--
-- Volontairement laissées telles quelles (usage employé) :
--   pointages (Mon espace : règles *_self), heures_validations_mensuelles et
--   formations_envois (règles *_self), documents_koala / documents_reponses
--   (déjà filtrées par rôle), pai et registre_infirmerie (lecture employé
--   prévue), kiosk_devices (terrain.js).
--   vaccinations : un employé qui remplit la fiche « vaccinations » dans
--   Documents la répercute dans cette table (vacSyncModuleDepuisFiche) ; la
--   fermer casserait cette synchro silencieusement.
--
-- À tester après application :
--   1. compte employé : Mon espace, Accès terrain, Documents fonctionnent ;
--   2. compte referent/direction : présences, goûters, frais pro, planning OK.
-- Retour arrière : même bloc avec le replace inversé sur les mêmes tables.
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
        'enfants_absences','enfants_contrats','enfants_pai',
        'documents_reponses_preuves',
        'gouters_creche_effectifs','gouters_creche_options',
        'gouters_creche_recettes','menus_gouters_creche',
        'planning','frais_pro','frais_pro_pdf'
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
