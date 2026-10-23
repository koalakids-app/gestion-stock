-- ============================================================================
-- Nettoyage des jeux et des espaces de vie : plan + registre (lien Stock ↔ PMS)
-- ============================================================================
-- Deux tables :
--   - nettoyage_plan    : ce qui doit être nettoyé dans une crèche (jeux et
--     jouets, espaces et mobilier), à quelle fréquence et avec quelle méthode.
--     Géré par la direction et les référent(e)s de la crèche.
--   - nettoyage_journal : le registre horodaté de chaque nettoyage réalisé
--     (qui, quand, avec quel produit). Saisi par toute l'équipe de la crèche
--     depuis stock.html › Nettoyages ; repris dans le PMS (documents.html).
--
-- `creche` est le nom court de la crèche (« Brunet »), comme articles.creche et
-- stock_couches.creche. Les droits passent par kk_acces_creche_nom(), déjà
-- utilisée par le module Stock : direction = toutes les crèches de
-- l'organisation, référent(e) / employé(e) = la leur.
--
-- Le registre est un document de traçabilité : aucune modification possible
-- après coup. Seule une suppression est permise, à la direction à tout moment
-- ou à l'auteur dans les 15 minutes (erreur de clic).
--
-- À exécuter dans le SQL Editor Supabase, UNE PARTIE À LA FOIS (l'éditeur
-- s'arrête à la première erreur sans la mettre en évidence). Chaque partie est
-- idempotente : elle peut être relancée sans doublon.
-- Annulation complète, à la fin du fichier.
-- ============================================================================


-- ============================================================================
-- PARTIE 1 / 6 — Table du plan de nettoyage
-- ============================================================================
create table if not exists public.nettoyage_plan (
  id          uuid primary key default gen_random_uuid(),
  creche      text not null,
  type        text not null check (type in ('jeux','espace')),
  libelle     text not null,
  frequence   text not null check (frequence in ('apres_usage','quotidien','hebdomadaire','mensuel')),
  methode     text,
  ordre       integer not null default 0,
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists nettoyage_plan_creche_idx
  on public.nettoyage_plan (creche, actif, type, ordre);

alter table public.nettoyage_plan enable row level security;


-- ============================================================================
-- PARTIE 2 / 6 — Table du registre des nettoyages
-- ============================================================================
-- libelle / type / frequence recopient la ligne du plan au moment du
-- nettoyage : l'historique reste lisible si le plan est modifié ou la ligne
-- retirée (plan_id passe alors à null).
create table if not exists public.nettoyage_journal (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid references public.nettoyage_plan(id) on delete set null,
  creche          text not null,
  type            text not null check (type in ('jeux','espace')),
  libelle         text not null,
  frequence       text,
  fait_le         date not null default current_date,
  fait_par        text,
  fait_par_user   uuid default auth.uid(),
  produit         text,
  observation     text,
  created_at      timestamptz not null default now()
);

create index if not exists nettoyage_journal_creche_idx
  on public.nettoyage_journal (creche, fait_le desc);
create index if not exists nettoyage_journal_plan_idx
  on public.nettoyage_journal (plan_id, fait_le desc);

alter table public.nettoyage_journal enable row level security;


-- ============================================================================
-- PARTIE 3 / 6 — Qui peut gérer le plan : direction et référent(e)s
-- ============================================================================
-- Même logique que kk_acces_creche_nom(), mais réservée aux rôles
-- direction / referent (les employé(e)s cochent le registre, ils ne modifient
-- pas le plan).
create or replace function public.kk_nettoyage_gestion(nom text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.referents r
    left join public.creches c on c.id = r.creche_id
    where r.user_id = auth.uid()
      and r.role in ('direction', 'referent')
      and (
        kk_stock_couches_nom_court(c.name) = nom
        or (r.creche_id is null and nom is not null and exists (
          select 1 from public.creches c2
          where kk_stock_couches_nom_court(c2.name) = nom and c2.org_id = r.org_id
        ))
      )
  );
$function$;


-- ============================================================================
-- PARTIE 4 / 6 — Droits sur le plan
-- ============================================================================
drop policy if exists nettoyage_plan_select on public.nettoyage_plan;
create policy nettoyage_plan_select on public.nettoyage_plan
  for select to authenticated
  using (public.kk_acces_creche_nom(creche));

drop policy if exists nettoyage_plan_insert on public.nettoyage_plan;
create policy nettoyage_plan_insert on public.nettoyage_plan
  for insert to authenticated
  with check (public.kk_nettoyage_gestion(creche));

drop policy if exists nettoyage_plan_update on public.nettoyage_plan;
create policy nettoyage_plan_update on public.nettoyage_plan
  for update to authenticated
  using (public.kk_nettoyage_gestion(creche))
  with check (public.kk_nettoyage_gestion(creche));

drop policy if exists nettoyage_plan_delete on public.nettoyage_plan;
create policy nettoyage_plan_delete on public.nettoyage_plan
  for delete to authenticated
  using (public.kk_nettoyage_gestion(creche));


-- ============================================================================
-- PARTIE 5 / 6 — Droits sur le registre (pas de modification, suppression limitée)
-- ============================================================================
drop policy if exists nettoyage_journal_select on public.nettoyage_journal;
create policy nettoyage_journal_select on public.nettoyage_journal
  for select to authenticated
  using (public.kk_acces_creche_nom(creche));

drop policy if exists nettoyage_journal_insert on public.nettoyage_journal;
create policy nettoyage_journal_insert on public.nettoyage_journal
  for insert to authenticated
  with check (public.kk_acces_creche_nom(creche) and fait_par_user = auth.uid());

-- Aucune policy UPDATE : une ligne du registre ne se modifie pas.
drop policy if exists nettoyage_journal_delete on public.nettoyage_journal;
create policy nettoyage_journal_delete on public.nettoyage_journal
  for delete to authenticated
  using (
    public.kk_est_direction()
    or (fait_par_user = auth.uid() and created_at > now() - interval '15 minutes')
  );


-- ============================================================================
-- PARTIE 6 / 6 — Vérification (lecture seule)
-- ============================================================================
-- Doit renvoyer 2 tables avec rowsecurity = true, puis 7 policies (4 sur le
-- plan : select, insert, update, delete ; 3 sur le registre : select, insert,
-- delete).
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename in ('nettoyage_plan', 'nettoyage_journal');

select tablename, policyname, cmd from pg_policies
 where schemaname = 'public' and tablename in ('nettoyage_plan', 'nettoyage_journal')
 order by tablename, cmd;


-- ============================================================================
-- Annulation complète (à ne lancer que pour tout retirer, historique compris)
-- ============================================================================
-- drop table if exists public.nettoyage_journal;
-- drop table if exists public.nettoyage_plan;
-- drop function if exists public.kk_nettoyage_gestion(text);
