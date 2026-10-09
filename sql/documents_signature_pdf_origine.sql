-- ============================================================================
-- PDF d'origine d'un document signable à distance.
-- ============================================================================
-- Le fichier Word (fichier_url) est mal rendu dans un navigateur (mise en page
-- approchée). Pour retrouver la signature sur le document tel qu'il est
-- vraiment, on rattache sa version PDF (export Word → PDF) :
--   * documents.html : bouton « Joindre le PDF d'origine » (direction) ;
--   * la signature + sa date sont apposées sur la dernière page de CE PDF
--     (pdf-lib, dans le navigateur), le PDF d'origine n'est jamais modifié ;
--   * signature.html affiche ce PDF au signataire quand il existe.
-- Idempotent.
-- ============================================================================

alter table public.documents_koala add column if not exists fichier_pdf_url text;

-- Nouvelle fonction (kk_sig_document, déjà en production, n'est pas modifiée).
create or replace function public.kk_sig_document_pdf(p_token text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.fichier_pdf_url
    from public.signatures_pending s
    join public.documents_koala d on d.id = s.document_id
   where length(coalesce(p_token, '')) >= 20
     and s.token = p_token
     and s.expire_at > now()
     and s.signature_data is null
   limit 1;
$$;

revoke all on function public.kk_sig_document_pdf(text) from public;
grant execute on function public.kk_sig_document_pdf(text) to anon, authenticated;
