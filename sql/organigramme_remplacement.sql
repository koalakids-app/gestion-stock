-- ============================================================================
-- Organigramme : arrêts et remplacements
-- ============================================================================
-- `en_arret`   : la personne est absente (arrêt maladie, congé…) ; sa carte est grisée et n'entre plus dans les totaux.
-- `remplace_id`: carte de la personne remplacée. La remplaçante s'affiche à côté d'elle, sur le même poste
--                (mêmes liens vers le haut et vers l'équipe) ; la personne remplacée est considérée en arrêt.
-- À appliquer à la main sur Supabase (projet juyrceadazrovlitxceb), après sql/organigramme.sql. Idempotent.
-- Annulation : alter table public.organigramme_cartes drop column en_arret, drop column remplace_id;
-- ============================================================================
alter table public.organigramme_cartes
  add column if not exists en_arret boolean not null default false,
  add column if not exists remplace_id uuid references public.organigramme_cartes(id) on delete set null;
create index if not exists organigramme_cartes_remplace_idx on public.organigramme_cartes(remplace_id);
