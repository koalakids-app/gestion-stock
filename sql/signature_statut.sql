-- ============================================================================
-- Statut d'un lien de signature : en_attente / signe / expire / inconnu.
-- ============================================================================
-- Permet à la page signature.html restée ouverte (ex. ordinateur) de s'apercevoir
-- que le document a déjà été signé depuis un autre appareil (ex. téléphone après
-- scan du QR code) et d'afficher « Signature enregistrée » au lieu de rester sur le
-- cadre de signature. Ne renvoie que le statut, jamais la signature elle-même.
-- Nouvelle fonction : kk_sig_get / kk_sig_sign (déjà en production) ne sont pas modifiées.
-- ============================================================================
create or replace function public.kk_sig_statut(p_token text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select case
              when s.signature_data is not null then 'signe'
              when s.expire_at <= now() then 'expire'
              else 'en_attente'
            end
       from public.signatures_pending s
      where length(coalesce(p_token, '')) >= 20 and s.token = p_token
      limit 1),
    'inconnu');
$$;

revoke all on function public.kk_sig_statut(text) from public;
grant execute on function public.kk_sig_statut(text) to anon, authenticated;
