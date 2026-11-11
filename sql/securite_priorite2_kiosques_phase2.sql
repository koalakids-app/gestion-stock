-- Sécurité — priorité 2, PHASE 2 : fermer les anciennes signatures des fonctions de kiosque.
-- À appliquer à la main APRÈS la mise en ligne du nouveau suivi.html (envoi de p_appareil) et
-- le rechargement des tablettes de suivi. Un jeton lié à un appareil n'est alors plus accepté
-- par l'ancienne signature ; un jeton non lié reste ouvert jusqu'à sa première liaison.
create or replace function public.kk_kiosk_ancienne_signature_ok(p_token uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$ select public.kk_kiosk_appareil_ok(p_token, null) $$;

-- Retour arrière :
--   create or replace function public.kk_kiosk_ancienne_signature_ok(p_token uuid)
--   returns boolean language sql stable security definer set search_path to 'public' as $$ select true $$;
