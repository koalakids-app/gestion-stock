-- ============================================================================
-- Fiche employé — date de fin de la période d'essai (2 mois, renouvelable
-- une fois), avec remontée en alerte sur les tableaux de bord.
-- ============================================================================
-- periode_essai_fin recalculée à chaque écriture par trigger (comme
-- code_pointage), pas une colonne generated : le déclenchement doit rester
-- possible même si une future évolution a besoin de la corriger à la main.
-- periode_essai_actee permet de faire disparaître l'alerte une fois la
-- décision prise (embauche confirmée ou fin de contrat), sans quoi une
-- période d'essai dépassée resterait signalée indéfiniment.
-- ============================================================================

alter table public.employes add column if not exists periode_essai_renouvelee boolean not null default false;
alter table public.employes add column if not exists periode_essai_actee boolean not null default false;
alter table public.employes add column if not exists periode_essai_fin date;

create or replace function public.kk_trg_set_periode_essai_fin()
returns trigger
language plpgsql
as $$
begin
  if new.date_debut is null then
    new.periode_essai_fin := null;
  else
    new.periode_essai_fin := new.date_debut
      + (case when new.periode_essai_renouvelee then interval '4 months' else interval '2 months' end);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employes_periode_essai_fin on public.employes;
create trigger trg_employes_periode_essai_fin
  before insert or update on public.employes
  for each row execute function public.kk_trg_set_periode_essai_fin();

-- Backfill des fiches existantes.
update public.employes
  set periode_essai_fin = date_debut
    + (case when periode_essai_renouvelee then interval '4 months' else interval '2 months' end)
  where date_debut is not null;

-- Index pour les alertes (tableau de bord direction et tableau de bord
-- crèche) : périodes d'essai non encore actées, triées par échéance.
create index if not exists employes_periode_essai_fin_idx
  on public.employes (periode_essai_fin)
  where periode_essai_actee = false and periode_essai_fin is not null;
