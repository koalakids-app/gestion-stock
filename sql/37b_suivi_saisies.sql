-- ============================================================================
-- 37b — Suivi de l'enfant : saisies du quotidien (santé, soins)
-- ============================================================================
-- Une ligne = un toucher sur la tablette (repas, sieste, change, humeur,
-- température, soin, incident léger, note libre). `valeur` est un jsonb pour
-- rester assez souple pour ces natures très différentes sans multiplier les
-- colonnes NULL (ex. {"niveau":"bien"} pour un repas, {"nature":"urine"}
-- pour un change, {"celsius":38.2} pour une température, {"texte":"..."}
-- pour une note libre/dictée).
--
-- `creche_id` est dénormalisé (comme sur `pointages`) : la tablette écrit
-- via une fonction SECURITY DEFINER (script 37g) qui ne connaît la personne
-- que par son code_pointage + le token de sa tablette, jamais par
-- auth.uid() — la RLS doit donc pouvoir filtrer par crèche sans repasser par
-- `enfants` à chaque lecture.
--
-- Verrouillage : même principe que `registre_infirmerie.locked_at` —
-- modifiable le jour même, gelé le lendemain (fonction de verrouillage en
-- 37g). Après gel, toute correction est une NOUVELLE ligne, jamais un UPDATE
-- de la ligne gelée.
-- ============================================================================

create table if not exists public.suivi_saisies (
  id                  uuid primary key default gen_random_uuid(),
  enfant_id           uuid not null references public.enfants(id) on delete cascade,
  creche_id           uuid not null references public.creches(id),
  type                text not null check (type in (
                          'repas', 'sieste_debut', 'sieste_fin', 'change',
                          'temperature', 'humeur', 'soin', 'incident', 'note'
                        )),
  valeur              jsonb not null default '{}'::jsonb,
  horodatage          timestamptz not null default now(),
  auteur_referent_id  uuid references public.referents(id),
  source              text not null default 'kiosque_connecte'
                        check (source in ('kiosque_connecte', 'kiosque_code', 'ordinateur')),
  locked_at           timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists suivi_saisies_enfant_horodatage_idx
  on public.suivi_saisies (enfant_id, horodatage desc);

create index if not exists suivi_saisies_creche_horodatage_idx
  on public.suivi_saisies (creche_id, horodatage desc);

-- Pour le verrouillage automatique au chargement (repère les lignes d'un
-- jour antérieur pas encore gelées), même logique que autoLock() côté
-- registre_infirmerie.
create index if not exists suivi_saisies_a_verrouiller_idx
  on public.suivi_saisies (horodatage) where locked_at is null;

alter table public.suivi_saisies enable row level security;

create policy suivi_saisies_select on public.suivi_saisies
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_saisies.creche_id)
    )
  );

-- Saisie depuis un ordinateur avec compte (hors tablette kiosque, qui passe
-- par la fonction SECURITY DEFINER du script 37g).
create policy suivi_saisies_insert on public.suivi_saisies
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_saisies.creche_id)
    )
  );

-- Correction avant gel uniquement (la journée en cours).
create policy suivi_saisies_update on public.suivi_saisies
  for update to authenticated
  using (
    locked_at is null
    and exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_saisies.creche_id)
    )
  )
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_saisies.creche_id)
    )
  );

-- Suppression : réservée à la direction, et seulement avant gel (la fenêtre
-- "Annuler 10 s" de la tablette passe elle par la fonction SECURITY DEFINER
-- du script 37g, pas par cette policy).
create policy suivi_saisies_delete on public.suivi_saisies
  for delete to authenticated
  using (
    locked_at is null
    and exists (
      select 1 from public.referents r
      where r.user_id = auth.uid() and r.creche_id is null
    )
  );

grant select, insert, update, delete on public.suivi_saisies to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification
-- ----------------------------------------------------------------------------
select
  (select count(*) from public.suivi_saisies) as nb_lignes,
  (select count(*) from pg_policies where schemaname='public' and tablename='suivi_saisies') as nb_policies;
