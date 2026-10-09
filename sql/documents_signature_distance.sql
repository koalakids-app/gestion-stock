-- ============================================================================
-- Documents « à télécharger » signables à distance par l'envoi d'un lien.
-- ============================================================================
-- Un document marqué `signature_distance` affiche, dans la bibliothèque, un
-- bouton « Envoyer pour signature » : il génère un lien (signature.html?t=…,
-- valable 7 jours) à transmettre au signataire attendu. Le signataire lit le
-- document sur la page, coche « J'ai pris connaissance », puis signe au doigt.
-- La signature est conservée dans `signatures_pending` (signature_data,
-- signed_at, opened_at) et son état est affiché sur la ligne du document.
--
-- Signataire attendu pour les 5 protocoles d'Ollioules : Laurence Borodine,
-- RSAI.
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================================

alter table public.documents_koala add column if not exists signature_distance boolean not null default false;
alter table public.documents_koala add column if not exists signataire_nom text;
alter table public.documents_koala add column if not exists signataire_fonction text;

-- Les 5 protocoles concernés (identifiés par leur id, pas par leur titre).
update public.documents_koala
   set signature_distance   = true,
       signataire_nom       = 'Laurence Borodine',
       signataire_fonction  = 'RSAI'
 where id in (
   'bebe38aa-cdfd-49b7-923f-a087969b7f66',  -- Protocole sortie OLL MAJ 120424
   '1c9b7aec-ea99-487a-b6fd-e66fc3ad8c7a',  -- Protocole situations urgence Ollioules
   'bcc2ef87-c03a-4dc9-ba69-d6a9c081b4b6',  -- Protocole délivrance de Soins spécifiques
   '19562456-436e-472c-86bc-a5706fa6c1dc',  -- Protocole d'hygiène renforcée (maladie contagieuse / épidémie)
   '2aca6e12-5b9e-4d35-85c4-aeb81e7ff549'   -- Protocole suspicion de maltraitance
 );

-- Document attaché à un lien de signature encore valide : permet à la page
-- publique signature.html d'afficher le protocole à lire avant de signer.
-- Nouvelle fonction (kk_sig_get, déjà en production, n'est pas modifiée).
create or replace function public.kk_sig_document(p_token text)
returns table(titre text, fichier_url text, fichier_nom text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.titre, d.fichier_url, d.fichier_nom
    from public.signatures_pending s
    join public.documents_koala d on d.id = s.document_id
   where length(coalesce(p_token, '')) >= 20
     and s.token = p_token
     and s.expire_at > now()
     and s.signature_data is null
   limit 1;
$$;

revoke all on function public.kk_sig_document(text) from public;
grant execute on function public.kk_sig_document(text) to anon, authenticated;

-- Vérification (attendu : 5 lignes)
-- select titre, signataire_nom, signataire_fonction from public.documents_koala where signature_distance;
