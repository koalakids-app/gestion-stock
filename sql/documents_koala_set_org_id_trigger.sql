-- ============================================================================
-- Multi-tenant : documents_koala.org_id sans trigger, découvert en production
-- (« null value in column "org_id" of relation "documents_koala" violates
-- not-null constraint ») à la création d'un document dans documents.html.
-- ============================================================================
-- documents_koala.org_id est NOT NULL sans DEFAULT, et le front
-- (documents.html saveDoc / bulkImport, js/vaccinations.js) n'envoie jamais ce
-- champ, en confiance que la base s'en charge.
--
-- Même classe de bug que evenements / documents_reponses / fournisseurs : un
-- trigger BEFORE INSERT résout l'organisation via kk_mon_org(), sans jamais
-- écraser une valeur déjà fournie.
--
-- MISE À JOUR 30/09/2026 : basculé sur la fonction mutualisée
-- public.set_org_id_from_session() (créée pour evenements/documents_reponses,
-- puis reprise par fournisseurs et reunions_direction) plutôt que de garder
-- une fonction dédiée de plus faisant exactement la même chose ; l'ancienne
-- fonction documents_koala_set_org_id() a été supprimée.
-- ============================================================================

drop trigger if exists trg_documents_koala_set_org_id on public.documents_koala;
create trigger trg_documents_koala_set_org_id
before insert on public.documents_koala
for each row execute function public.set_org_id_from_session();
