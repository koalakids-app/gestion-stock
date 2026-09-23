-- ============================================================================
-- Piste d'audit de la signature à distance (QR) : date d'ouverture du lien
-- par le signataire, en plus de l'envoi (created_at, déjà présente) et de la
-- signature (signed_at, déjà présente).
-- ============================================================================
-- Nouvelle fonction plutôt qu'une modification de `kk_sig_get` : cette RPC
-- est déjà en production, utilisée par toute signature à distance de
-- l'application (pas seulement le contrat de travail) — on ne touche pas à
-- son corps sans en avoir la source exacte sous les yeux. `signature.html`
-- appelle simplement cette nouvelle fonction en plus, en best-effort.
-- ============================================================================

alter table public.signatures_pending add column if not exists opened_at timestamptz;

create or replace function public.kk_sig_marquer_ouvert(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.signatures_pending
    set opened_at = now()
    where token = p_token and opened_at is null;
$$;

revoke all on function public.kk_sig_marquer_ouvert(text) from public;
grant execute on function public.kk_sig_marquer_ouvert(text) to anon, authenticated;
