-- ============================================================================
-- Sécurité et performance — audit, priorité 3 (à appliquer à la main sur le projet juyrceadazrovlitxceb)
-- ============================================================================
-- 1. Codes de l'Espace famille : tirage cryptographique (pgcrypto) au lieu de random(), search_path fixé.
-- 2. Fonctions SECURITY DEFINER qui n'ont pas à être appelées par l'API : déclencheurs et création d'accès
--    famille (plus d'EXECUTE pour anon / authenticated) ; fonctions réservées aux comptes connectés
--    (plus d'EXECUTE pour anon).
-- 3. Doublons de contraintes uniques (presences, stagiaires) supprimés ; la contrainte conservée impose la même règle.
-- 4. Politiques RLS : auth.uid() / auth.role() / auth.jwt() enveloppés dans (select …) pour être évalués une
--    fois par requête et non par ligne (alerte « auth_rls_initplan » du linter Supabase). Même résultat.
-- Retour arrière : voir la fin du fichier.
-- ============================================================================

-- ---------- 1. Code Espace famille ----------
create or replace function public.kk_famille_nouveau_code()
returns text
language plpgsql
set search_path to 'public', 'extensions'
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- 31 caractères
  c text; i int; b int;
begin
  loop
    c := '';
    for i in 1..8 loop
      loop
        b := get_byte(gen_random_bytes(1), 0);
        exit when b < 248;                    -- 248 = 8 × 31 : pas de biais de modulo
      end loop;
      c := c || substr(alphabet, 1 + (b % 31), 1);
    end loop;
    exit when not exists (select 1 from public.famille_acces where code = c);
  end loop;
  return c;
end;
$$;

-- ---------- 2. Fonctions non destinées à l'API ----------
revoke all on function public.kk_famille_creer_acces(uuid) from public, anon, authenticated;
revoke all on function public.kk_famille_trg_contrat() from public, anon, authenticated;
revoke all on function public.kk_famille_trg_parent() from public, anon, authenticated;
revoke all on function public.kk_album_retrait_accord() from public, anon, authenticated;
revoke all on function public.marquer_message_employe_lu(uuid) from public, anon;
revoke all on function public.supprimer_push_subscription(text) from public, anon;

-- ---------- 3. Doublons de contraintes uniques ----------
alter table public.presences drop constraint if exists presences_enfant_date_slot_unique;   -- reste presences_enfant_id_presence_date_slot_key
alter table public.stagiaires drop constraint if exists stagiaires_token_uk;                -- reste stagiaires_token_key

-- ---------- 4. RLS : (select auth.uid()) ----------
do $$
declare
  r record;
  nq text; nw text; ordre text;
  n int := 0;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual,'') ~ 'auth\.(uid|role|jwt)\(\)' or coalesce(with_check,'') ~ 'auth\.(uid|role|jwt)\(\)')
  loop
    nq := case when r.qual is null then null
               else regexp_replace(r.qual, '(?<!SELECT )auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g') end;
    nw := case when r.with_check is null then null
               else regexp_replace(r.with_check, '(?<!SELECT )auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g') end;
    if nq is not distinct from r.qual and nw is not distinct from r.with_check then continue; end if;
    ordre := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if nq is not null then ordre := ordre || ' using (' || nq || ')'; end if;
    if nw is not null then ordre := ordre || ' with check (' || nw || ')'; end if;
    execute ordre;
    n := n + 1;
  end loop;
  raise notice 'politiques réécrites : %', n;
end $$;

-- ---------- Retour arrière ----------
-- 1. Recréer kk_famille_nouveau_code avec random() (version de sql/espace_famille.sql).
-- 2. grant execute on function public.kk_famille_creer_acces(uuid), public.kk_famille_trg_contrat(),
--    public.kk_famille_trg_parent(), public.kk_album_retrait_accord() to anon, authenticated ;
--    grant execute on function public.marquer_message_employe_lu(uuid), public.supprimer_push_subscription(text) to anon.
-- 3. alter table public.presences add constraint presences_enfant_date_slot_unique unique (enfant_id, presence_date, slot);
--    alter table public.stagiaires add constraint stagiaires_token_uk unique (token);
-- 4. Aucun retour nécessaire : (select auth.uid()) est équivalent à auth.uid().
