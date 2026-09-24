-- ============================================================================
-- Devis (ex-« Inscriptions ») : suivi des visites et motif de refus
-- ============================================================================
-- date_visite / heure_visite : visite de la crèche prévue avec la famille.
-- visite_effectuee : cochée une fois la visite faite (la date reste, pour
-- l'historique).
-- motif_refus : pourquoi une famille a dit non — alimente le reporting des
-- refus du tableau de bord Devis. Liste fermée pour que les chiffres se
-- regroupent, « autre » en échappatoire (détail dans les notes internes).
-- ============================================================================

alter table public.preinscriptions
  add column if not exists date_visite date,
  add column if not exists heure_visite text,
  add column if not exists visite_effectuee boolean not null default false,
  add column if not exists motif_refus text;

alter table public.preinscriptions
  drop constraint if exists preinscriptions_motif_refus_ck;
alter table public.preinscriptions
  add constraint preinscriptions_motif_refus_ck check (
    motif_refus is null or motif_refus in
      ('trop_cher','creche_municipale','concurrent_micro_creche','ne_repond_plus','autre')
  );

create index if not exists preinscriptions_date_visite_idx
  on public.preinscriptions (date_visite) where date_visite is not null;
