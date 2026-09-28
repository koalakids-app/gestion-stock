-- ============================================================================
-- Multi-tenant : documents_reponses.org_id sans trigger, découvert en
-- production (échec « Enregistrement impossible : null value in column
-- "org_id" of relation "documents_reponses" ») en cochant un document reçu
-- (fiche sanitaire) dans la fiche enfant — 28/09/2026.
-- ============================================================================
-- documents_reponses.org_id est NOT NULL sans DEFAULT, et rien ne le
-- renseignait à l'insertion : le front (js/enfants.js enfMarquerRecu /
-- enfMarquerRecuSilencieux, js/vaccinations.js vacSyncFicheDocumentImpl,
-- etc.) n'envoie jamais ce champ, en confiance que la base s'en charge — ce
-- qu'elle ne faisait pas pour cette table.
--
-- Même classe de bug que fournisseurs.org_id (voir
-- fournisseurs_set_org_id_trigger.sql) : un champ obligatoire côté schéma
-- que le code applicatif ne pose jamais, découvert seulement quand
-- quelqu'un déclenche le chemin qui en a besoin.
--
-- Corrigé par un trigger BEFORE INSERT (org_id n'étant pas déductible d'une
-- constante mais de la session de l'appelant·e) qui reprend le même
-- principe que kk_mon_org() : résoudre l'organisation via la fiche
-- `referents` de la personne connectée, sans jamais écraser une valeur déjà
-- fournie.
-- ============================================================================

create or replace function public.documents_reponses_set_org_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.org_id is null then
    new.org_id := public.kk_mon_org();
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_documents_reponses_set_org_id on public.documents_reponses;
create trigger trg_documents_reponses_set_org_id
before insert on public.documents_reponses
for each row execute function public.documents_reponses_set_org_id();
