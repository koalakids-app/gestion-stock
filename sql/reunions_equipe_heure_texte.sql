-- ============================================================================
-- Réunions d'équipe : l'heure de la réunion devient un texte libre
-- ============================================================================
-- Le champ « Heure » du formulaire est libre (placeholder « 9h30 ») alors que
-- la colonne était de type `time` : « 9h30 » était refusé par la base
-- (invalid input syntax for type time) et le brouillon ne s'enregistrait pas.
-- Même choix que prochaine_reunion_heure (texte libre). Les heures déjà
-- saisies (hh:mm:ss) sont reformatées en « 9h30 ».
-- ============================================================================

alter table public.reunions_equipe
  alter column heure type text
  using case when heure is null then null
             else ltrim(to_char(heure, 'HH24'), '0') || 'h' || to_char(heure, 'MI') end;
