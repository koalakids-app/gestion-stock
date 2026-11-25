-- Planning équipe : absence, remplacement et heures supplémentaires directement sur la grille.
-- À appliquer à la main dans le SQL Editor de Supabase, UNE PARTIE À LA FOIS (1 puis 2).
-- Aucune donnée existante n'est modifiée : uniquement des colonnes facultatives.

-- ───────── PARTIE 1 ─────────
-- Colonnes ajoutées à planning_equipe :
--   absence_motif         : arret / conge / enfant_malade / autre (la ligne passe en type 'absent' ou 'conge',
--                           le créneau reste affiché, grisé, et sort des effectifs)
--   remplace_prenom       : sur la ligne de la personne qui remplace = prénom de la personne absente
--   heures_sup_min        : minutes en plus quand une pro déjà présente allonge sa journée pour remplacer
--   creneau_label_initial : son horaire d'origine, pour le rétablir si l'absence est annulée
alter table public.planning_equipe add column if not exists absence_motif text;
alter table public.planning_equipe add column if not exists remplace_prenom text;
alter table public.planning_equipe add column if not exists heures_sup_min integer;
alter table public.planning_equipe add column if not exists creneau_label_initial text;

-- ───────── PARTIE 2 ─────────
-- Contrôle des valeurs de motif (facultatif ; null = pas d'absence).
alter table public.planning_equipe drop constraint if exists planning_equipe_absence_motif_check;
alter table public.planning_equipe add constraint planning_equipe_absence_motif_check
  check (absence_motif is null or absence_motif in ('arret','conge','enfant_malade','autre'));
