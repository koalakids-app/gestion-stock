-- ============================================================================
-- Vérifications reunions_equipe (à lancer une par une, en lisant le résultat)
-- ============================================================================
-- Le SQL Editor de Supabase tourne en service_role, donc RLS n'y est jamais
-- appliqué : ces requêtes ne font que contrôler que la table/les policies
-- existent bien. Les vrais tests d'accès (un directeur/trice technique qui
-- ne voit que sa crèche, la direction qui voit tout, le verrou sur un CR
-- validé, la réouverture réservée à la direction) doivent être faits depuis
-- l'application, connecté avec un compte referent normal.
-- ============================================================================

-- 1. La table existe avec les bonnes colonnes.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'reunions_equipe'
order by ordinal_position;

-- 2. RLS est bien activée.
select relrowsecurity
from pg_class
where oid = 'public.reunions_equipe'::regclass;

-- 3. Les 6 policies attendues sont présentes.
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'reunions_equipe'
order by policyname;

-- 4. Le trigger de verrouillage est bien installé.
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.reunions_equipe'::regclass and not tgisinternal;

-- 5. Les GRANT attendus sur authenticated.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'reunions_equipe'
order by grantee, privilege_type;
