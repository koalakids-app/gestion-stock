-- ============================================================================
-- Multi-tenant : evenements.org_id et documents_reponses.org_id sans trigger,
-- découverts via la surveillance post-déploiement (échecs d'insertion visibles
-- par les utilisateurs le 28/09/2026)
-- ============================================================================
-- Les deux colonnes sont NOT NULL (Parties 1-3) et le code applicatif
-- (demandes.html pour evenements, documents.html pour documents_reponses) ne
-- les renseigne jamais à l'insertion, en confiance que la base s'en charge —
-- ce qu'elle ne faisait pas. Conséquence réelle, visible par les
-- utilisateurs (pas un échec silencieux ici, dbInsert/le code de sauvegarde
-- affichent bien l'erreur) :
--   - documents_reponses : 6 échecs entre 07h47 et 07h48 UTC le 28/09/2026
--     ("Erreur : null value in column "org_id"...") — bloque l'enregistrement
--     d'une réponse à un document (formulaire, contrat...).
--   - evenements : 9 échecs entre 09h09 et 11h09 UTC le 28/09/2026
--     ("Erreur lors de la création.") — bloque la création d'un événement.
--
-- Même classe de bug que reseau_config.id, frais_ik_config.id et
-- fournisseurs.org_id (sessions précédentes) : un champ obligatoire côté
-- schéma que le code applicatif ne pose jamais, découvert seulement quand
-- quelqu'un déclenche le chemin qui en a besoin.
--
-- Corrigé par le même principe de trigger BEFORE INSERT que fournisseurs.org_id
-- (org_id n'étant pas déductible d'une constante mais de la session de
-- l'appelant·e), mutualisé ici en une seule fonction puisque les trois
-- triggers (fournisseurs, evenements, documents_reponses) font exactement la
-- même chose.
--
-- Appliqué en prod le 29/09/2026.
-- ============================================================================

create or replace function public.set_org_id_from_session()
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

drop trigger if exists trg_evenements_set_org_id on public.evenements;
create trigger trg_evenements_set_org_id
before insert on public.evenements
for each row execute function public.set_org_id_from_session();

drop trigger if exists trg_documents_reponses_set_org_id on public.documents_reponses;
create trigger trg_documents_reponses_set_org_id
before insert on public.documents_reponses
for each row execute function public.set_org_id_from_session();
