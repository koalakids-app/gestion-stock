-- Heure de la PROCHAINE réunion (direction et équipe), texte libre ex. "9h30"
alter table public.reunions_direction add column if not exists prochaine_reunion_heure text;
alter table public.reunions_equipe add column if not exists prochaine_reunion_heure text;
