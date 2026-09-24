-- ============================================================================
-- Trace de réouverture (reunions_equipe)
-- ============================================================================
-- Quand la direction rouvre un compte rendu validé (statut valide -> brouillon,
-- cf. policy reunions_equipe_update_direction), on ne réinitialise PAS
-- valide_le/valide_par : ces deux colonnes gardent la trace de la dernière
-- validation. On ajoute reouvert_le/reouvert_par pour tracer la réouverture
-- elle-même, posés par l'application au moment du changement de statut.
-- Si le compte rendu est re-validé ensuite, valide_le/valide_par sont mis à
-- jour (nouvelle validation) sans effacer reouvert_le/reouvert_par : les deux
-- événements restent lisibles.
-- ============================================================================

alter table public.reunions_equipe add column if not exists reouvert_le timestamptz;
alter table public.reunions_equipe add column if not exists reouvert_par uuid references public.referents(id);
