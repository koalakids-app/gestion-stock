-- ============================================================================
-- Envoi d'un quiz/formation par la direction, plutôt qu'une liste à choisir
-- ============================================================================
-- Le parcours de formation affichait jusqu'ici, dans "Mon espace", un
-- sélecteur permettant au/à la collaborateur/trice de choisir n'importe quel
-- quiz ou micro-formation publié(e) et de s'auto-générer un lien. Ce n'est
-- pas le fonctionnement voulu : c'est la direction (ou une directrice
-- technique) qui décide qui doit faire quoi, depuis la fiche collaborateur
-- (employes.html) — "Mon espace" ne fait plus qu'afficher ce qui a été
-- envoyé, à faire ou déjà réalisé.
--
-- Cette table vit côté gestion-stock (et non quiz-protocoles, base
-- distincte) : c'est ici que sont authentifiées la direction et les
-- directrices techniques, et ici que vivent les fiches employes/referents.
-- Le rattachement au résultat, lui, continue de passer par le `ref` envoyé
-- dans le lien (id de la fiche), lu côté quiz-protocoles via
-- kk_resultats_par_ref / kk_formations_par_ref (cf. le repo quiz-protocoles).
-- ============================================================================

create table if not exists public.formations_envois (
  id           uuid primary key default gen_random_uuid(),
  employe_id   uuid references public.employes(id) on delete cascade,
  referent_id  uuid references public.referents(id) on delete cascade,
  kind         text not null check (kind in ('quiz','module')),
  item_id      uuid not null,   -- id du quiz ou du module, côté quiz-protocoles
  item_titre   text not null,   -- snapshot du titre au moment de l'envoi
  lien         text not null,
  envoye_par   uuid references auth.users(id),
  envoye_le    timestamptz not null default now(),
  constraint formations_envois_cible check (
    (employe_id is not null and referent_id is null) or
    (employe_id is null and referent_id is not null)
  )
);

create index if not exists formations_envois_employe_idx on public.formations_envois (employe_id);
create index if not exists formations_envois_referent_idx on public.formations_envois (referent_id);

alter table public.formations_envois enable row level security;

-- Direction (creche_id null) et directrices techniques (leur crèche
-- seulement) : même portée que employes_select/employes_insert.
create policy formations_envois_select_staff on public.formations_envois
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = coalesce(
          (select e.creche_id from public.employes e where e.id = formations_envois.employe_id),
          (select rf.creche_id from public.referents rf where rf.id = formations_envois.referent_id)
        ))
    )
  );

create policy formations_envois_insert on public.formations_envois
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = coalesce(
          (select e.creche_id from public.employes e where e.id = formations_envois.employe_id),
          (select rf.creche_id from public.referents rf where rf.id = formations_envois.referent_id)
        ))
    )
  );

create policy formations_envois_delete on public.formations_envois
  for delete to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = coalesce(
          (select e.creche_id from public.employes e where e.id = formations_envois.employe_id),
          (select rf.creche_id from public.referents rf where rf.id = formations_envois.referent_id)
        ))
    )
  );

-- Le/la collaborateur/trice lit ses propres envois, dans "Mon espace"
-- (collaborateur.html) — même principe que pointages_select_self_employe /
-- pointages_select_self_referent.
create policy formations_envois_select_self_employe on public.formations_envois
  for select to authenticated
  using (
    exists (select 1 from public.employes e where e.id = formations_envois.employe_id and e.user_id = auth.uid())
  );

create policy formations_envois_select_self_referent on public.formations_envois
  for select to authenticated
  using (
    exists (select 1 from public.referents r where r.id = formations_envois.referent_id and r.user_id = auth.uid())
  );
