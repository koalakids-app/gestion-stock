-- ============================================================================
-- Présences : enfant ajouté à la journée « en attente de place ».
-- Un enfant non prévu peut être inscrit sur la feuille du jour alors qu'aucune
-- place n'est encore libre : sa barre est hachurée sur le planning (Gantt)
-- jusqu'à ce que la place soit confirmée. Affichage uniquement : l'enfant est
-- compté comme les autres (effectif, encadrement, commande repas).
-- Appliqué.
-- ============================================================================

alter table public.presences add column if not exists attente_place boolean not null default false;
