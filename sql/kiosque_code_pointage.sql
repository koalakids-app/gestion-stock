-- ============================================================================
-- Kiosque "par code individuel" — pointage arrivée/départ sans compte
-- ============================================================================
-- Étape 1/N : schéma + fonctions SECURITY DEFINER + policies RLS.
-- Ne modifie ni ne casse le mode kiosque connecté existant (demandes.html).
--
-- Principe :
--   - Chaque enfant et chaque référent(e)/salarié(e) reçoit un code_pointage
--     à 4 chiffres, unique par crèche, généré automatiquement.
--   - Une tablette dédiée par crèche est enregistrée dans `kiosk_devices` et
--     reçoit un token (UUID long, imprévisible) inséré dans son URL. Ce token
--     joue le même rôle que le jeton de `signatures_pending` : il permet un
--     accès ciblé sans compte, et surtout il empêche quiconque connaît juste
--     l'anon key du projet (public dans le JS) d'appeler la RPC de pointage
--     "à l'aveugle" pour n'importe quelle crèche — un code à 4 chiffres seul
--     serait bien trop facile à cribler (10 000 combinaisons).
--   - La RPC `kk_kiosk_pointer` vérifie le token + le code, retrouve la
--     personne, bascule arrivée/départ et insère dans `pointages`. Aucune
--     lecture de liste de noms/codes n'est exposée à la tablette.
--   - Un compteur de tentatives (`kiosk_login_attempts`) limite le
--     bruteforçage du code à 4 chiffres même avec un token valide volé.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Colonnes code_pointage sur enfants et referents
-- ----------------------------------------------------------------------------

alter table public.enfants
  add column if not exists code_pointage text
    constraint enfants_code_pointage_format check (code_pointage ~ '^[0-9]{4}$');

alter table public.referents
  add column if not exists code_pointage text
    constraint referents_code_pointage_format check (code_pointage ~ '^[0-9]{4}$');

-- Unicité par crèche (les NULL — dossiers en cours de création — ne comptent pas).
create unique index if not exists enfants_code_pointage_uniq
  on public.enfants (creche_id, code_pointage) where code_pointage is not null;

create unique index if not exists referents_code_pointage_uniq
  on public.referents (creche_id, code_pointage) where code_pointage is not null;

-- ----------------------------------------------------------------------------
-- 2. Génération automatique d'un code unique (croise enfants + referents,
--    car l'unicité doit être garantie sur les deux tables à la fois : la
--    tablette ne sait pas a priori si un code tapé est un enfant ou un pro).
-- ----------------------------------------------------------------------------

create or replace function public.kk_gen_code_pointage(p_creche_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_taken boolean;
  v_attempts int := 0;
begin
  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 200 then
      raise exception 'Impossible de générer un code_pointage unique pour la crèche %', p_creche_id;
    end if;
    v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
    select exists(
      select 1 from public.enfants where creche_id = p_creche_id and code_pointage = v_code
      union all
      select 1 from public.referents where creche_id = p_creche_id and code_pointage = v_code
    ) into v_taken;
    exit when not v_taken;
  end loop;
  return v_code;
end;
$$;

-- Triggers : à la création d'un dossier, si aucun code n'est fourni, on en
-- génère un automatiquement.

create or replace function public.kk_trg_set_code_pointage_enfant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code_pointage is null and new.creche_id is not null then
    new.code_pointage := public.kk_gen_code_pointage(new.creche_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enfants_code_pointage on public.enfants;
create trigger trg_enfants_code_pointage
  before insert on public.enfants
  for each row execute function public.kk_trg_set_code_pointage_enfant();

create or replace function public.kk_trg_set_code_pointage_referent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code_pointage is null and new.creche_id is not null then
    new.code_pointage := public.kk_gen_code_pointage(new.creche_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_referents_code_pointage on public.referents;
create trigger trg_referents_code_pointage
  before insert on public.referents
  for each row execute function public.kk_trg_set_code_pointage_referent();

-- ----------------------------------------------------------------------------
-- 3. Backfill des dossiers existants (creche_id non nul uniquement — un
--    référent direction avec creche_id null n'a pas de sens à pointer).
-- ----------------------------------------------------------------------------

update public.enfants
  set code_pointage = public.kk_gen_code_pointage(creche_id)
  where code_pointage is null and creche_id is not null;

update public.referents
  set code_pointage = public.kk_gen_code_pointage(creche_id)
  where code_pointage is null and creche_id is not null;

-- ----------------------------------------------------------------------------
-- 4. Visibilité / modification du code_pointage : direction et référente de
--    la crèche concernée uniquement. C'est déjà la portée des policies RLS
--    existantes sur `enfants` et `referents` (cf. README, table des rôles) —
--    RLS s'applique par ligne, donc une nouvelle colonne hérite automatique-
--    ment de ces policies sans rien ajouter ici.
--
--    ⚠️ À VÉRIFIER MANUELLEMENT avant de considérer l'étape terminée :
--    - la policy UPDATE de `enfants`/`referents` autorise bien un `referent`
--      à modifier sa propre crèche (elle est probablement déjà utilisée par
--      inscriptions.html pour éditer un dossier) ;
--    - aucune policy plus permissive (ex. `using (true)`) n'existe sur ces
--      tables, ce qui exposerait code_pointage à toutes les crèches.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 5. Traçabilité : distinguer un pointage saisi depuis le kiosque connecté
--    (tuiles, avec compte) d'un pointage saisi par code sur tablette dédiée.
-- ----------------------------------------------------------------------------

alter table public.pointages
  add column if not exists source text not null default 'kiosque_connecte'
    constraint pointages_source_check check (source in ('kiosque_connecte', 'kiosque_code'));

-- effectue_par (uuid -> auth.users) ne peut pas être renseigné par une
-- tablette sans compte : personne n'est authentifié côté client. On le
-- laisse NULL pour les pointages par code (no-op si déjà nullable).
alter table public.pointages
  alter column effectue_par drop not null;

-- ----------------------------------------------------------------------------
-- 6. Tablettes dédiées (une par crèche, éventuellement plusieurs)
-- ----------------------------------------------------------------------------

create table if not exists public.kiosk_devices (
  id          uuid primary key default gen_random_uuid(),
  creche_id   uuid not null references public.creches(id),
  token       uuid not null default gen_random_uuid() unique,
  label       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id)
);

alter table public.kiosk_devices enable row level security;

-- Direction (creche_id null sur son profil referents) : accès à toutes les
-- tablettes. Référent(e) : accès aux tablettes de sa propre crèche
-- uniquement. Jamais d'accès anonyme (la tablette elle-même n'utilise que le
-- token, jamais une lecture de cette table).

create policy kiosk_devices_select on public.kiosk_devices
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = kiosk_devices.creche_id)
    )
  );

create policy kiosk_devices_insert on public.kiosk_devices
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = kiosk_devices.creche_id)
    )
  );

create policy kiosk_devices_update on public.kiosk_devices
  for update to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = kiosk_devices.creche_id)
    )
  )
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = kiosk_devices.creche_id)
    )
  );

-- (Pas de policy delete pour l'instant : désactiver via `active = false`
-- plutôt que supprimer, pour garder l'historique des tablettes émises.)

-- ----------------------------------------------------------------------------
-- 7. Anti-bruteforce du code à 4 chiffres
-- ----------------------------------------------------------------------------

create table if not exists public.kiosk_login_attempts (
  id           bigint generated always as identity primary key,
  device_id    uuid not null references public.kiosk_devices(id) on delete cascade,
  success      boolean not null,
  attempted_at timestamptz not null default now()
);

create index if not exists kiosk_login_attempts_device_time
  on public.kiosk_login_attempts (device_id, attempted_at desc);

alter table public.kiosk_login_attempts enable row level security;
-- Aucune policy : ni anon ni authenticated n'accèdent directement à cette
-- table. Seules les fonctions SECURITY DEFINER ci-dessous la lisent/écrivent.

-- ----------------------------------------------------------------------------
-- 8. RPC principale : vérifie token + code, bascule arrivée/départ, insère
--    le pointage. Utilisable par le rôle `anon` (tablette non connectée).
-- ----------------------------------------------------------------------------

create or replace function public.kk_kiosk_pointer(p_token uuid, p_code text)
returns table(
  ok boolean,
  error text,
  type text,
  label text,
  sub text,
  action text,
  horodatage timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device        public.kiosk_devices;
  v_recent_fail   int;
  v_enfant        public.enfants;
  v_referent      public.referents;
  v_creche_id     uuid;
  v_id            uuid;
  v_type          text;
  v_label         text;
  v_sub           text;
  v_last_action   text;
  v_new_action    text;
  v_horodatage    timestamptz;
begin
  -- Jeton de la tablette
  select * into v_device from public.kiosk_devices
    where token = p_token and active = true;

  if v_device is null then
    return query select false, 'token_invalide', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  -- Anti-bruteforce : au-delà de 15 échecs sur les 5 dernières minutes pour
  -- cette tablette, on bloque temporairement (sans même vérifier le code).
  select count(*) into v_recent_fail
    from public.kiosk_login_attempts
    where device_id = v_device.id
      and success = false
      and attempted_at > now() - interval '5 minutes';

  if v_recent_fail >= 15 then
    return query select false, 'trop_de_tentatives', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  v_creche_id := v_device.creche_id;

  if p_code is null or p_code !~ '^[0-9]{4}$' then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_invalide', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  -- Recherche parmi les enfants de la crèche
  select * into v_enfant from public.enfants
    where creche_id = v_creche_id and code_pointage = p_code
      and (date_sortie is null or date_sortie >= current_date)
    limit 1;

  -- Recherche parmi les référent(e)s/salarié(e)s de la crèche
  select * into v_referent from public.referents
    where creche_id = v_creche_id and code_pointage = p_code
    limit 1;

  if v_enfant.id is not null and v_referent.id is not null then
    -- Collision enfant/référent sur le même code : ne devrait jamais arriver
    -- (kk_gen_code_pointage vérifie les deux tables), mais on refuse plutôt
    -- que de pointer la mauvaise personne.
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_ambigu', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  elsif v_enfant.id is not null then
    v_type := 'enfant';
    v_id := v_enfant.id;
    v_label := v_enfant.prenom;
    v_sub := v_enfant.nom;
  elsif v_referent.id is not null then
    v_type := 'salarie';
    v_id := v_referent.id;
    v_label := v_referent.name;
    v_sub := coalesce(v_referent.poste, case when v_referent.role = 'direction' then 'Direction' else 'Référente' end);
  else
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_inconnu', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  -- Dernier pointage du jour pour cette personne -> on bascule l'action
  select p.action into v_last_action
    from public.pointages p
    where p.creche_id = v_creche_id
      and ((v_type = 'enfant' and p.enfant_id = v_id) or (v_type = 'salarie' and p.salarie_id = v_id))
      and p.horodatage::date = current_date
    order by p.horodatage desc
    limit 1;

  v_new_action := case when v_last_action = 'arrivee' then 'depart' else 'arrivee' end;

  -- `horodatage` bare serait ambigu ici : RETURNS TABLE déclare aussi une
  -- colonne de sortie nommée `horodatage`, qui masque la colonne de la table
  -- dans un RETURNING non qualifié (erreur Postgres 42702). D'où l'alias.
  if v_type = 'enfant' then
    insert into public.pointages as pt (creche_id, enfant_id, action, effectue_par, source)
      values (v_creche_id, v_id, v_new_action, null, 'kiosque_code')
      returning pt.horodatage into v_horodatage;
  else
    insert into public.pointages as pt (creche_id, salarie_id, action, effectue_par, source)
      values (v_creche_id, v_id, v_new_action, null, 'kiosque_code')
      returning pt.horodatage into v_horodatage;
  end if;

  insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, true);

  return query select true, null::text, v_type, v_label, v_sub, v_new_action, v_horodatage;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. RPC d'annulation : permet à la personne de corriger une frappe faite
--    par erreur, dans les 2 minutes qui suivent, en retapant son code.
--    (Optionnel pour l'étape 1 — inclus car symétrique à kioskUndo() côté
--    kiosque connecté ; à confirmer si vous voulez la garder pour l'étape 2.)
-- ----------------------------------------------------------------------------

create or replace function public.kk_kiosk_annuler_dernier(p_token uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device     public.kiosk_devices;
  v_enfant_id  uuid;
  v_referent_id uuid;
  v_creche_id  uuid;
  v_rows       int;
begin
  select * into v_device from public.kiosk_devices where token = p_token and active = true;
  if v_device is null or p_code !~ '^[0-9]{4}$' then
    return false;
  end if;
  v_creche_id := v_device.creche_id;

  select id into v_enfant_id from public.enfants
    where creche_id = v_creche_id and code_pointage = p_code limit 1;
  select id into v_referent_id from public.referents
    where creche_id = v_creche_id and code_pointage = p_code limit 1;

  delete from public.pointages
    where creche_id = v_creche_id
      and source = 'kiosque_code'
      and horodatage > now() - interval '2 minutes'
      and (
        (v_enfant_id is not null and enfant_id = v_enfant_id)
        or (v_referent_id is not null and salarie_id = v_referent_id)
      )
      and id = (
        select id from public.pointages p2
        where p2.creche_id = v_creche_id
          and p2.source = 'kiosque_code'
          and ((v_enfant_id is not null and p2.enfant_id = v_enfant_id)
               or (v_referent_id is not null and p2.salarie_id = v_referent_id))
        order by p2.horodatage desc
        limit 1
      );

  -- GET DIAGNOSTICS ... row_count exige une cible entière : une variable
  -- boolean provoquait une erreur de cast à l'exécution (jamais au moment du
  -- CREATE FUNCTION, d'où le bug passé inaperçu jusqu'au premier vrai appel).
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. Droits d'exécution
-- ----------------------------------------------------------------------------

revoke all on function public.kk_kiosk_pointer(uuid, text) from public;
grant execute on function public.kk_kiosk_pointer(uuid, text) to anon, authenticated;

revoke all on function public.kk_kiosk_annuler_dernier(uuid, text) from public;
grant execute on function public.kk_kiosk_annuler_dernier(uuid, text) to anon, authenticated;

-- kk_gen_code_pointage n'est appelée que par les triggers / le backfill /
-- la direction depuis le SQL editor : pas besoin de l'exposer à anon.
revoke all on function public.kk_gen_code_pointage(uuid) from public;
grant execute on function public.kk_gen_code_pointage(uuid) to authenticated;

-- ============================================================================
-- Fin étape 1.
--
-- Points à valider avant de passer à l'étape 2 (tablette.html) :
--   1. Que la policy UPDATE existante sur `enfants`/`referents` permette bien
--      à une référente d'éditer/régénérer le code de sa propre crèche
--      (section 4 ci-dessus).
--   2. Le nom exact des colonnes utilisées ici (enfants.prenom/nom,
--      referents.name/poste/role, pointages.enfant_id/salarie_id/creche_id/
--      action/effectue_par/horodatage) a été repris de demandes.html — à
--      confirmer contre le schéma réel avant exécution en prod.
--   3. Comment seront émis les tokens de `kiosk_devices` en pratique (un
--      écran dans parametres.html pour la direction/référente, à faire en
--      étape 2) et comment la tablette figera son URL avec `?k=<token>`.
-- ============================================================================
