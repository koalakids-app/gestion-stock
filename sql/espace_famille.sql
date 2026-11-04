-- ============================================================================
-- Espace famille : code d'accès personnel, informations de la crèche, dépôt de documents
-- ============================================================================
-- La famille n'a pas de compte Supabase. Chaque parent reçoit UN accès (un code court à
-- saisir sur espace-famille.html, ou le lien qui le contient). Tout passe par l'edge
-- function `espace-famille` (service_role) : aucune policy `anon`, aucune table lue
-- directement par la page publique.
--
--  - famille_acces            : un accès par enfant ET par parent (révocable, jamais supprimé).
--  - famille_messages         : informations de la crèche (toute la crèche ou un enfant précis).
--  - famille_messages_lus     : lecture par accès (alimentée par l'edge function).
--  - famille_essais           : échecs de saisie de code (limite par adresse IP, edge function).
--
-- Les documents déposés par la famille vont dans `enfants_documents_admin` (bucket privé
-- `documents-admin`, dossier de l'enfant) et préviennent la référente via `depots_externes`,
-- comme pieces.html : rien de nouveau à configurer côté stockage.
-- À appliquer à la main sur Supabase (une partie à la fois si l'éditeur expire).
-- ============================================================================

-- ---------- 1. Accès -------------------------------------------------------

create table if not exists public.famille_acces (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid default public.kk_mon_org(),
  creche_id            uuid not null references public.creches(id),
  enfant_id            uuid not null references public.enfants(id) on delete cascade,
  parent_id            uuid not null references public.enfants_parents(id) on delete cascade,
  code                 text not null unique,
  token                uuid not null default gen_random_uuid() unique,
  actif                boolean not null default true,
  derniere_connexion   timestamptz,
  revoque_le           timestamptz,
  cree_par             uuid references public.referents(id),
  created_at           timestamptz not null default now()
);

-- Un seul accès actif à la fois par couple enfant / parent (on révoque puis on recrée).
create unique index if not exists famille_acces_enfant_parent_actif_uniq
  on public.famille_acces (enfant_id, parent_id) where actif;
create index if not exists famille_acces_creche_idx on public.famille_acces (creche_id);

-- Code à 8 caractères sans lettres ambiguës (pas de 0/O, 1/I/L) : ~8,5 x 10^11 combinaisons.
create or replace function public.kk_famille_nouveau_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
  i int;
begin
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.famille_acces where code = c);
  end loop;
  return c;
end;
$$;

alter table public.famille_acces alter column code set default public.kk_famille_nouveau_code();

alter table public.famille_acces enable row level security;

drop policy if exists famille_acces_select on public.famille_acces;
create policy famille_acces_select on public.famille_acces
  for select to authenticated using (public.kk_acces_creche(creche_id));

drop policy if exists famille_acces_insert on public.famille_acces;
create policy famille_acces_insert on public.famille_acces
  for insert to authenticated with check (public.kk_acces_creche(creche_id));

-- Révocation (actif = false) ; pas de DELETE : on révoque, on ne supprime jamais un accès émis.
drop policy if exists famille_acces_update on public.famille_acces;
create policy famille_acces_update on public.famille_acces
  for update to authenticated
  using (public.kk_acces_creche(creche_id))
  with check (public.kk_acces_creche(creche_id));

grant select, insert, update on public.famille_acces to authenticated;

-- ---------- 2. Informations de la crèche -----------------------------------

create table if not exists public.famille_messages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid default public.kk_mon_org(),
  creche_id   uuid not null references public.creches(id),
  enfant_id   uuid references public.enfants(id) on delete cascade,   -- null = toutes les familles de la crèche
  auteur_id   uuid references public.referents(id),
  auteur_nom  text not null default '',
  titre       text not null,
  corps       text not null,
  created_at  timestamptz not null default now()
);
create index if not exists famille_messages_creche_idx on public.famille_messages (creche_id, created_at desc);

alter table public.famille_messages enable row level security;

drop policy if exists famille_messages_select on public.famille_messages;
create policy famille_messages_select on public.famille_messages
  for select to authenticated using (public.kk_acces_creche(creche_id));
drop policy if exists famille_messages_insert on public.famille_messages;
create policy famille_messages_insert on public.famille_messages
  for insert to authenticated with check (public.kk_acces_creche(creche_id));
drop policy if exists famille_messages_delete on public.famille_messages;
create policy famille_messages_delete on public.famille_messages
  for delete to authenticated using (public.kk_acces_creche(creche_id));

grant select, insert, delete on public.famille_messages to authenticated;

create table if not exists public.famille_messages_lus (
  message_id  uuid not null references public.famille_messages(id) on delete cascade,
  acces_id    uuid not null references public.famille_acces(id) on delete cascade,
  lu_le       timestamptz not null default now(),
  primary key (message_id, acces_id)
);

alter table public.famille_messages_lus enable row level security;

drop policy if exists famille_messages_lus_select on public.famille_messages_lus;
create policy famille_messages_lus_select on public.famille_messages_lus
  for select to authenticated
  using (exists (select 1 from public.famille_messages m
                 where m.id = famille_messages_lus.message_id and public.kk_acces_creche(m.creche_id)));

grant select on public.famille_messages_lus to authenticated;

-- ---------- 3. Limite des essais de code (service_role uniquement) ---------

create table if not exists public.famille_essais (
  id          bigint generated always as identity primary key,
  ip          text not null,
  created_at  timestamptz not null default now()
);
create index if not exists famille_essais_ip_idx on public.famille_essais (ip, created_at desc);
alter table public.famille_essais enable row level security;   -- aucune policy : service_role seul

-- ---------- Vérification ----------------------------------------------------
select
  (select count(*) from pg_policies where schemaname='public' and tablename='famille_acces')        as policies_acces,
  (select count(*) from pg_policies where schemaname='public' and tablename='famille_messages')     as policies_messages,
  public.kk_famille_nouveau_code()                                                                  as exemple_code;
