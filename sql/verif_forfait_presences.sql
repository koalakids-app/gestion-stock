-- ============================================================================
-- VÉRIFICATION — forfait « journée non pointée », absences, corrections de départ
-- ============================================================================
-- Lecture seule : ne modifie rien. À lancer dans le SQL editor de Supabase après
--   sql/absences_forfait.sql  et  sql/pointages_correction.sql
-- Résultat : une ligne par contrôle, colonne « ok » à true / false / null
-- (null = information à lire, pas un échec). Tout ce qui est à false est à traiter.
-- ============================================================================

with
-- 1. Table des absences
t_abs as (
  select exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'enfants_absences') as ok
),
cols_abs as (
  select c as colonne,
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'enfants_absences' and column_name = c) as ok
  from unnest(array['id','enfant_id','date_debut','date_fin','justifiee','motif','created_by','created_at']) as c
),
rls_abs as (
  select coalesce((select relrowsecurity from pg_class
                   where oid = to_regclass('public.enfants_absences')), false) as ok
),
pol_abs as (
  select cmd, count(*) as n
  from pg_policies
  where schemaname = 'public' and tablename = 'enfants_absences'
  group by cmd
),
-- 2. Source des pointages
src as (
  select pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid = to_regclass('public.pointages') and conname = 'pointages_source_check'
),
-- 3. Forfait dans la config des tarifs
tarif as (
  select config ->> 'forfait_non_pointe' as forfait
  from public.tarifs_repas_config
  where id = '00000000-0000-0000-0000-000000000001'
),
-- 4. Contrainte sur factures_lignes.type (la ligne de forfait utilise « supplement »)
fl_type as (
  select pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid = to_regclass('public.factures_lignes')
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%type%'
),
-- 5. Triggers sur pointages (une règle « délai » ou un horodatage forcé les expliquerait)
trg as (
  select tgname, pg_get_triggerdef(oid) as def
  from pg_trigger
  where tgrelid = to_regclass('public.pointages') and not tgisinternal
)

select 1 as n, 'Table enfants_absences existe' as controle,
       (select ok from t_abs) as ok,
       case when (select ok from t_abs) then '' else 'Lancer sql/absences_forfait.sql' end as detail

union all
select 2, 'Colonnes de enfants_absences',
       (select bool_and(ok) from cols_abs),
       coalesce((select string_agg(colonne, ', ') from cols_abs where not ok), 'toutes présentes')

union all
select 3, 'RLS activée sur enfants_absences',
       (select ok from rls_abs),
       case when (select ok from rls_abs) then '' else 'Sans RLS, toute la base peut lire les absences' end

union all
select 4, 'Policies enfants_absences (select, insert, update, delete)',
       (select count(distinct cmd) from pol_abs where cmd in ('SELECT','INSERT','UPDATE','DELETE')) = 4,
       coalesce((select string_agg(cmd || ' x' || n, ', ' order by cmd) from pol_abs), 'aucune policy')

union all
select 5, 'Contrainte de dates (date_fin >= date_debut)',
       exists (select 1 from pg_constraint
               where conrelid = to_regclass('public.enfants_absences') and conname = 'enfants_absences_dates_check'),
       ''

union all
select 6, 'pointages_source_check accepte « correction »',
       coalesce((select def ilike '%correction%' from src), false),
       coalesce((select def from src), 'contrainte introuvable : lancer sql/pointages_correction.sql')

union all
select 7, 'Sources déjà présentes dans pointages (information)',
       null,
       coalesce((select string_agg(source || ' : ' || n, ' · ' order by source)
                 from (select source, count(*) as n from public.pointages group by source) x), 'aucun pointage')

union all
select 8, 'Forfait journée non pointée enregistré (montant > 0)',
       coalesce((select forfait::numeric > 0 from tarif), false),
       coalesce((select 'valeur : ' || forfait from tarif),
                'clé absente ou ligne de config introuvable : renseigner le tarif dans Présences › Commande repas')

union all
select 9, 'factures_lignes.type accepte « supplement »',
       coalesce((select bool_or(def ilike '%supplement%') from fl_type), true),
       coalesce((select string_agg(def, ' | ') from fl_type), 'aucune contrainte sur type (tout est accepté)')

union all
select 10, 'Triggers sur pointages (information)',
       null,
       coalesce((select string_agg(tgname, ', ') from trg), 'aucun')

union all
select 11, 'Absences déclarées (information)',
       null,
       case when (select ok from t_abs)
            then (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.enfants_absences', false, true, '')))[1]::text || ' ligne(s)'
            else 'table absente' end

union all
select 12, 'Corrections de départ enregistrées (information)',
       null,
       coalesce((select count(*)::text || ' correction(s), la plus récente le '
                        || to_char(max(horodatage), 'DD/MM/YYYY HH24:MI')
                 from public.pointages where source = 'correction'
                 having count(*) > 0), 'aucune')

order by n;

-- ----------------------------------------------------------------------------
-- Détail utile si le contrôle 9 échoue ou si la suppression d'une correction est
-- refusée : décommenter pour lire les définitions complètes.
-- ----------------------------------------------------------------------------
-- select tgname, pg_get_triggerdef(oid) from pg_trigger
--   where tgrelid = 'public.pointages'::regclass and not tgisinternal;
-- select policyname, cmd, qual, with_check from pg_policies
--   where schemaname = 'public' and tablename in ('pointages', 'enfants_absences');
