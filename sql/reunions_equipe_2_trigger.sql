-- ============================================================================
-- Verrouillage d'un compte rendu validé (reunions_equipe)
-- ============================================================================
-- Une fois `statut = 'valide'`, le compte rendu est figé : plus aucune
-- colonne de fond ne peut changer. Seule une transition explicite
-- valide -> brouillon (réouverture, réservée à la direction par la policy
-- RLS de reunions_equipe_3_rls.sql) est autorisée, et elle doit repasser par
-- valide_le / valide_par remis à NULL par l'appelant.
-- ============================================================================

create or replace function public.kk_reunions_equipe_verrou()
returns trigger
language plpgsql
as $$
begin
  if old.statut = 'valide' and new.statut = 'valide' then
    raise exception 'Ce compte rendu est validé et ne peut plus être modifié. Demandez une réouverture à la direction.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists reunions_equipe_verrou on public.reunions_equipe;

create trigger reunions_equipe_verrou
  before update on public.reunions_equipe
  for each row
  execute function public.kk_reunions_equipe_verrou();
