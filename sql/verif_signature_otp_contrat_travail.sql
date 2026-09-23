-- ============================================================================
-- Vérification post-déploiement — renforcement de la signature du contrat de
-- travail (sql/documents_reponses_signature_renforcee.sql +
-- sql/signatures_pending_audit.sql + edge function signature-otp).
-- À exécuter dans l'éditeur SQL Supabase après les deux migrations. Chaque
-- ligne doit afficher le compte attendu indiqué en commentaire.
-- ============================================================================

-- 1) Colonnes OTP + preuve de signature sur documents_reponses (attendu : 10)
select count(*) as nb_colonnes_attendu_10
from information_schema.columns
where table_schema='public' and table_name='documents_reponses'
  and column_name in (
    'otp_code_hash','otp_expire_le','otp_tentatives','otp_envois',
    'otp_dernier_envoi','otp_verifie_le','otp_employe_id',
    'signature_empreinte','signature_ip','signature_user_agent'
  );

-- 2) Table de preuve dédiée + RLS activée (attendu : 1 table, rls = true)
select
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='documents_reponses_preuves') as nb_table_attendu_1,
  (select relrowsecurity from pg_class where oid='public.documents_reponses_preuves'::regclass) as rls_activee;

-- 3) Policy de lecture sur documents_reponses_preuves (attendu : 1, select uniquement)
select policyname, cmd, roles
from pg_policies
where schemaname='public' and tablename='documents_reponses_preuves';

-- 4) Contrainte sur les événements journalisés (attendu : la liste des 6 valeurs)
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid='public.documents_reponses_preuves'::regclass
  and contype='c';

-- 5) Colonne opened_at + RPC de marquage d'ouverture du lien QR (attendu : 1 chacun)
select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='signatures_pending' and column_name='opened_at')
    as nb_colonne_opened_at_attendu_1,
  (select count(*) from pg_proc
     where proname='kk_sig_marquer_ouvert' and pronamespace='public'::regnamespace)
    as nb_fonction_attendu_1;

-- 6) Droits d'exécution de la RPC (attendu : anon ET authenticated)
select grantee, privilege_type
from information_schema.role_routine_grants
where routine_name='kk_sig_marquer_ouvert' and routine_schema='public';

-- 7) Dépendance : employes.email doit exister (source du code OTP) — attendu : 1
select count(*) as nb_colonne_email_employes_attendu_1
from information_schema.columns
where table_schema='public' and table_name='employes' and column_name='email';

-- 8) Dépendance : etablissements.capital_social / rcs_ville (PR #251) — attendu : 2
select count(*) as nb_colonnes_capital_rcs_attendu_2
from information_schema.columns
where table_schema='public' and table_name='etablissements'
  and column_name in ('capital_social','rcs_ville');
