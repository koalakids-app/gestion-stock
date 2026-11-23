-- ============================================================================
-- Soutien proposé aux familles (Supports pédagogiques ↔ Espace famille)
-- ============================================================================
-- L'équipe (direction / coordination pédagogique, ou référent·e de la crèche) propose à une
-- ou plusieurs familles un support pédagogique de la bibliothèque, avec un mot personnel
-- obligatoire. La famille le retrouve dans l'Espace famille (edge function `espace-famille` :
-- actions `get`, `soutien_ouvrir`, `soutien_retour`) et peut répondre « utile », « bof » ou
-- « j'aimerais en parler ».
--  * supports_pedagogiques.famille : la direction marque les supports qu'on peut proposer aux
--    familles (rien n'est proposable par défaut : contenus de tiers, formation interne…).
--  * famille_soutiens : une ligne par enfant ET par support proposé. `origine` reste INTERNE
--    (jamais renvoyée à la famille). La famille ne lit jamais la table : tout passe par l'edge
--    function (service_role).
-- À appliquer à la main sur Supabase (projet juyrceadazrovlitxceb), après
-- supports_pedagogiques.sql et espace_famille.sql, une partie à la fois. Idempotent.
-- ============================================================================

-- 1) Supports proposables aux familles
alter table public.supports_pedagogiques
  add column if not exists famille boolean not null default false;

-- 2) Propositions
create table if not exists public.famille_soutiens (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid default public.kk_mon_org(),
  creche_id   uuid not null references public.creches(id),
  enfant_id   uuid not null references public.enfants(id) on delete cascade,
  support_id  uuid not null references public.supports_pedagogiques(id) on delete cascade,
  origine     text not null default 'observation'
              check (origine in ('demande', 'observation', 'echange')),   -- interne, jamais montré à la famille
  mot         text not null check (length(btrim(mot)) > 0 and length(mot) <= 1500),
  auteur_id   uuid references public.referents(id),
  auteur_nom  text not null default '',
  created_at  timestamptz not null default now(),
  ouvert_le   timestamptz,                                                -- première ouverture par la famille
  retour      text check (retour in ('utile', 'bof', 'en_parler')),
  retour_le   timestamptz
);
create index if not exists famille_soutiens_enfant_idx on public.famille_soutiens (enfant_id, created_at desc);
create index if not exists famille_soutiens_creche_idx on public.famille_soutiens (creche_id, created_at desc);
create unique index if not exists famille_soutiens_unique_idx on public.famille_soutiens (enfant_id, support_id);

alter table public.famille_soutiens enable row level security;

-- Lecture / écriture : direction et référent·e de la crèche (jamais les comptes `employe`).
drop policy if exists famille_soutiens_select on public.famille_soutiens;
create policy famille_soutiens_select on public.famille_soutiens
  for select to authenticated using (public.kk_acces_creche_gestion(creche_id));

drop policy if exists famille_soutiens_insert on public.famille_soutiens;
create policy famille_soutiens_insert on public.famille_soutiens
  for insert to authenticated
  with check (
    public.kk_acces_creche_gestion(creche_id)
    and exists (select 1 from public.enfants e where e.id = enfant_id and e.creche_id = famille_soutiens.creche_id)
    and exists (select 1 from public.supports_pedagogiques s
                where s.id = support_id and s.famille and s.org_id = public.kk_mon_org())
  );

drop policy if exists famille_soutiens_delete on public.famille_soutiens;
create policy famille_soutiens_delete on public.famille_soutiens
  for delete to authenticated using (public.kk_acces_creche_gestion(creche_id));

revoke all on public.famille_soutiens from anon;
grant select, insert, delete on public.famille_soutiens to authenticated;
