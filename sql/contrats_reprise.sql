-- ============================================================================
-- Reprise de contrats existants (signés hors application, ex. dans Gertrude)
-- ============================================================================
-- Un contrat repris est enregistré directement au statut « contresigne », sans
-- passer par l'envoi à la famille ni la contresignature à l'écran :
--   • il n'y a ni tracé de signature, ni jeton, ni date d'envoi — les inventer
--     serait fabriquer une preuve qui n'existe pas ;
--   • la colonne `origine` le distingue de tout contrat établi dans
--     l'application, pour qu'un contrôle PMI sache d'où il vient ;
--   • l'original signé reste celui d'origine (papier ou PDF Gertrude).
--
-- Les deux contraintes qui exigeaient ces preuves sont assouplies POUR LES
-- SEULS contrats `origine = 'reprise'`. Les contrats établis dans l'application
-- restent soumis aux règles d'origine.
--
-- À exécuter une fois (SQL Editor Supabase). Idempotent.
-- ============================================================================

alter table public.contrats
  add column if not exists origine text not null default 'application',
  add column if not exists reprise_reference text,
  add column if not exists reprise_signe_le date;

alter table public.contrats drop constraint if exists contrats_origine_ck;
alter table public.contrats
  add constraint contrats_origine_ck check (origine in ('application', 'reprise'));

-- Contresigné = date de contresignature ET tracé… sauf pour une reprise.
alter table public.contrats drop constraint if exists contrats_contresigne_ck;
alter table public.contrats
  add constraint contrats_contresigne_ck check (
    statut <> 'contresigne'
    or (contresigne_le is not null
        and (contresignature_png is not null or origine = 'reprise'))
  );

-- Hors brouillon/annulé, un contrat doit avoir été envoyé (jeton + date)…
-- sauf une reprise, qui n'a jamais été envoyée depuis l'application.
alter table public.contrats drop constraint if exists contrats_envoi_ck;
alter table public.contrats
  add constraint contrats_envoi_ck check (
    statut in ('brouillon', 'annule')
    or origine = 'reprise'
    or (token is not null and envoye_le is not null)
  );

comment on column public.contrats.origine is
  'application = établi, envoyé et signé dans l''application ; reprise = contrat signé hors application (ex. Gertrude), saisi tel quel.';
comment on column public.contrats.reprise_reference is
  'Référence du contrat dans l''ancien logiciel (facultatif).';
comment on column public.contrats.reprise_signe_le is
  'Date de signature du contrat d''origine, pour une reprise (facultatif).';
