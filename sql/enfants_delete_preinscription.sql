-- Supprimer une fiche enfant issue d'une préinscription échouait : la clé
-- preinscriptions.enfant_id est en ON DELETE SET NULL, et la contrainte
-- preinscriptions_bascule_ck refuse statut = 'inscrit' sans enfant_id.
-- Avant la suppression, la préinscription liée repasse donc en « accepte »
-- (la famille reste suivie, sans fiche enfant).
create or replace function public.kk_trg_enfant_avant_suppression()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.preinscriptions
     set statut = 'accepte'
   where enfant_id = old.id and statut = 'inscrit';
  return old;
end;
$$;

drop trigger if exists trg_enfants_avant_suppression on public.enfants;
create trigger trg_enfants_avant_suppression
  before delete on public.enfants
  for each row execute function public.kk_trg_enfant_avant_suppression();
