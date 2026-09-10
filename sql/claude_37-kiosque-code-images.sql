-- ============================================================================
-- Kiosque "par code image" — pointage des ENFANTS uniquement, sans compte.
-- ============================================================================
-- Complète sql/kiosque_code_pointage.sql : les enfants ne pointent plus avec
-- un code à 4 chiffres mais avec une séquence de 4 pictogrammes distincts,
-- dans l'ordre, choisis parmi un pool fixe de 8 images. Le personnel
-- (referents / employes) continue d'utiliser le code_pointage à 4 chiffres
-- existant — ce script ne touche pas à cette table ni à kk_kiosk_pointer.
--
-- Le pool de 8 pictogrammes est écrit en dur ici (fonction kk_pictos_pool)
-- ET côté JS (js/kiosque-pictos.js) : les deux listes doivent rester
-- identiques, dans le même ordre, sous peine de désynchroniser les grilles
-- de sélection avec les codes déjà enregistrés en base.
--
--   ours · arc_en_ciel · zebre · hochet · baleine · cubes_alphabet ·
--   camionnette_rouge · pingouin
--
-- Sécurité : comme pour kk_kiosk_pointer, aucune lecture directe de la liste
-- des enfants ou de leurs codes n'est exposée à `anon` — seules les fonctions
-- SECURITY DEFINER ci-dessous touchent `enfants`, et elles ne renvoient que
-- le strict nécessaire (jamais la ligne complète : pas d'allergies, pas de
-- date de naissance, etc.).
--
-- ⚠️ Point d'attention : contrairement à kk_kiosk_pointer (qui exige un
-- token de tablette en plus du code, cf. le long commentaire en tête de
-- kiosque_code_pointage.sql), verifier_code_pointage() ci-dessous ne prend
-- que `p_creche_id` — c'est la signature demandée pour cette étape. Avec un
-- pool de 8 images, un code à 4 emplacements distincts n'a que 8×7×6×5 =
-- 1 680 combinaisons possibles, nettement moins que les 10 000 du code à 4
-- chiffres, et sans le garde-fou du token si quelqu'un devine ou obtient un
-- creche_id. Le taux de tentatives est donc limité ci-dessous (comme pour
-- kiosk_login_attempts), mais il serait plus sûr, à terme, de ne jamais
-- appeler ce RPC depuis un client qui ne connaît pas déjà `p_creche_id` via
-- un token de tablette validé (cf. tablette.html, qui ne lit p_creche_id que
-- via son token `?k=`, jamais saisi/deviné par l'utilisateur).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Pool de pictogrammes + validateur de code (fonctions immuables,
--    réutilisées par la contrainte de colonne et par les RPC).
-- ----------------------------------------------------------------------------

create or replace function public.kk_pictos_pool()
returns text[]
language sql
immutable
as $$
  select array[
    'ours','arc_en_ciel','zebre','hochet',
    'baleine','cubes_alphabet','camionnette_rouge','pingouin'
  ]::text[];
$$;

create or replace function public.kk_valid_code_pictos(p_code text[])
returns boolean
language sql
immutable
as $$
  select p_code is null or (
    array_length(p_code, 1) = 4
    and cardinality(array(select distinct unnest(p_code))) = 4
    and p_code <@ public.kk_pictos_pool()
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. Colonne code_pictos sur enfants (les referents/employes gardent le code
--    à 4 chiffres existant, cf. kiosque_code_pointage.sql).
-- ----------------------------------------------------------------------------

alter table public.enfants
  add column if not exists code_pictos text[]
    constraint enfants_code_pictos_format check (public.kk_valid_code_pictos(code_pictos));

-- Unicité par crèche (même principe que enfants_code_pointage_uniq).
create unique index if not exists enfants_code_pictos_uniq
  on public.enfants (creche_id, code_pictos) where code_pictos is not null;

-- ----------------------------------------------------------------------------
-- 3. Anti-bruteforce, par crèche (pas de kiosk_devices/token ici, cf. note
--    de sécurité en tête de fichier).
-- ----------------------------------------------------------------------------

create table if not exists public.kiosk_pictos_attempts (
  id           bigint generated always as identity primary key,
  creche_id    uuid not null references public.creches(id) on delete cascade,
  success      boolean not null,
  attempted_at timestamptz not null default now()
);

create index if not exists kiosk_pictos_attempts_creche_time
  on public.kiosk_pictos_attempts (creche_id, attempted_at desc);

alter table public.kiosk_pictos_attempts enable row level security;
-- Aucune policy : ni anon ni authenticated n'accèdent directement à cette
-- table. Seule verifier_code_pointage() (SECURITY DEFINER) la lit/écrit.

-- ----------------------------------------------------------------------------
-- 4. RPC principale : vérifie le code image pour une crèche donnée, bascule
--    arrivée/départ et insère le pointage — symétrique de kk_kiosk_pointer,
--    mais pour un enfant identifié par son code_pictos uniquement.
--    Réservée aux enfants : ne regarde jamais `referents`/`employes`.
-- ----------------------------------------------------------------------------

create or replace function public.verifier_code_pointage(p_creche_id uuid, p_code text[])
returns table(
  ok          boolean,
  error       text,
  enfant_id   uuid,
  prenom      text,
  nom         text,
  action      text,
  horodatage  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enfant       public.enfants;
  v_recent_fail  int;
  v_last_action  text;
  v_new_action   text;
  v_horodatage   timestamptz;
begin
  if p_creche_id is null then
    return query select false, 'creche_invalide', null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if not public.kk_valid_code_pictos(p_code) or p_code is null then
    return query select false, 'code_invalide', null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  -- Anti-bruteforce : au-delà de 15 échecs sur les 5 dernières minutes pour
  -- cette crèche, on bloque temporairement (sans même vérifier le code).
  select count(*) into v_recent_fail
    from public.kiosk_pictos_attempts
    where creche_id = p_creche_id
      and success = false
      and attempted_at > now() - interval '5 minutes';

  if v_recent_fail >= 15 then
    return query select false, 'trop_de_tentatives', null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select * into v_enfant from public.enfants
    where creche_id = p_creche_id and code_pictos = p_code
      and (date_sortie is null or date_sortie >= current_date)
    limit 1;

  if v_enfant.id is null then
    insert into public.kiosk_pictos_attempts(creche_id, success) values (p_creche_id, false);
    return query select false, 'code_inconnu', null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  insert into public.kiosk_pictos_attempts(creche_id, success) values (p_creche_id, true);

  select p.action into v_last_action
    from public.pointages p
    where p.creche_id = p_creche_id
      and p.enfant_id = v_enfant.id
      and p.horodatage::date = current_date
    order by p.horodatage desc
    limit 1;

  v_new_action := case when v_last_action = 'arrivee' then 'depart' else 'arrivee' end;

  insert into public.pointages as pt (creche_id, enfant_id, action, effectue_par, source)
    values (p_creche_id, v_enfant.id, v_new_action, null, 'kiosque_code')
    returning pt.horodatage into v_horodatage;

  return query select true, null::text, v_enfant.id, v_enfant.prenom, v_enfant.nom, v_new_action, v_horodatage;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Génération d'un code image, réservée à direction/référente (même
--    portée que kk_gen_code_pointage : grant authenticated uniquement, la
--    RLS sur `enfants` protège l'écriture effective du code généré).
-- ----------------------------------------------------------------------------

create or replace function public.generer_code_pictos(p_creche_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pool     text[] := public.kk_pictos_pool();
  v_code     text[];
  v_taken    boolean;
  v_attempts int := 0;
begin
  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 200 then
      raise exception 'Impossible de générer un code_pictos unique pour la crèche %', p_creche_id;
    end if;

    -- Tirage de 4 pictos distincts ; l'ordre du tirage est l'ordre du code.
    select array_agg(picto) into v_code
      from (select picto from unnest(v_pool) as picto order by random() limit 4) s;

    select exists(
      select 1 from public.enfants
        where creche_id = p_creche_id and code_pictos = v_code
    ) into v_taken;

    exit when not v_taken;
  end loop;

  return v_code;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Résolution creche_id <- token de tablette. verifier_code_pointage()
--    prend p_creche_id en clair (cf. note de sécurité en tête de fichier) ;
--    ce petit helper permet à tablette.html de retrouver le creche_id de son
--    token `?k=` sans jamais lire kiosk_devices en direct (RLS le bloque à
--    anon) ni sans que le creche_id soit saisi/deviné par l'utilisateur.
-- ----------------------------------------------------------------------------

create or replace function public.kk_resolve_creche_id(p_token uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select creche_id from public.kiosk_devices where token = p_token and active = true;
$$;

-- ----------------------------------------------------------------------------
-- 7. Droits d'exécution
-- ----------------------------------------------------------------------------

revoke all on function public.verifier_code_pointage(uuid, text[]) from public;
grant execute on function public.verifier_code_pointage(uuid, text[]) to anon, authenticated;

revoke all on function public.generer_code_pictos(uuid) from public;
grant execute on function public.generer_code_pictos(uuid) to authenticated;

revoke all on function public.kk_pictos_pool() from public;
grant execute on function public.kk_pictos_pool() to anon, authenticated;

revoke all on function public.kk_valid_code_pictos(text[]) from public;
grant execute on function public.kk_valid_code_pictos(text[]) to anon, authenticated;

revoke all on function public.kk_resolve_creche_id(uuid) from public;
grant execute on function public.kk_resolve_creche_id(uuid) to anon, authenticated;

-- ============================================================================
-- Fin.
--
-- Points à valider avant mise en prod (comme pour kiosque_code_pointage.sql) :
--   1. Le pool de pictogrammes ci-dessus doit rester identique, dans le même
--      ordre, à celui utilisé côté JS (grille kiosque + génération de code
--      dans la fiche enfant) — toute divergence casserait la comparaison
--      code_pictos = p_code.
--   2. La note de sécurité en tête de fichier sur l'absence de token pour
--      verifier_code_pointage() : à confirmer que c'est acceptable pour ce
--      module, ou à faire évoluer vers un couple (token, code_pictos) comme
--      kk_kiosk_pointer si besoin d'un niveau de protection équivalent.
-- ============================================================================
