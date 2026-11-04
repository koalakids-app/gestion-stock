-- ============================================================================
-- Espace famille : créé automatiquement à la signature du contrat d'accueil
-- ============================================================================
-- Dès qu'un contrat passe à « signe » (signature de la famille) ou « contresigne»
-- et qu'il est rattaché à une fiche enfant, chaque parent de l'enfant reçoit un
-- accès actif (famille_acces, code généré). Le code part par e-mail avec le contrat
-- signé (edge function envoyer-contrat-signe) et reste visible dans la fiche enfant.
--
-- Trois déclencheurs, pour ne rien rater quel que soit l'ordre des événements :
--   1. contrats : statut -> signe / contresigne  (ou enfant_id renseigné après coup,
--      cas du contrat signé avant la création de la fiche enfant) ;
--   2. enfants_parents : un parent ajouté plus tard à un enfant déjà sous contrat signé.
-- Idempotent : l'index unique (enfant_id, parent_id) where actif empêche les doublons ;
-- un accès révoqué à la main n'est PAS recréé tant que le parent n'a pas de nouvel accès
-- demandé (le déclencheur ne s'active que sur un changement de statut / d'enfant / un
-- nouveau parent).
-- À appliquer à la main APRÈS sql/espace_famille.sql.
-- ============================================================================

create or replace function public.kk_famille_creer_acces(p_enfant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creche uuid;
  v_org uuid;
begin
  select e.creche_id into v_creche from public.enfants e where e.id = p_enfant;
  if v_creche is null then return; end if;
  select c.org_id into v_org from public.creches c where c.id = v_creche;

  insert into public.famille_acces (org_id, creche_id, enfant_id, parent_id)
  select v_org, v_creche, p_enfant, p.id
  from public.enfants_parents p
  where p.enfant_id = p_enfant
    and not exists (select 1 from public.famille_acces a
                    where a.enfant_id = p_enfant and a.parent_id = p.id)   -- jamais de recréation d'un accès révoqué
  on conflict do nothing;
end;
$$;

create or replace function public.kk_famille_trg_contrat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.enfant_id is not null and new.statut in ('signe', 'contresigne')
     and (tg_op = 'INSERT'
          or old.statut is distinct from new.statut
          or old.enfant_id is distinct from new.enfant_id) then
    perform public.kk_famille_creer_acces(new.enfant_id);
  end if;
  return new;
end;
$$;

drop trigger if exists kk_famille_contrat on public.contrats;
create trigger kk_famille_contrat
  after insert or update of statut, enfant_id on public.contrats
  for each row execute function public.kk_famille_trg_contrat();

create or replace function public.kk_famille_trg_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.contrats c
             where c.enfant_id = new.enfant_id and c.statut in ('signe', 'contresigne')) then
    perform public.kk_famille_creer_acces(new.enfant_id);
  end if;
  return new;
end;
$$;

drop trigger if exists kk_famille_parent on public.enfants_parents;
create trigger kk_famille_parent
  after insert on public.enfants_parents
  for each row execute function public.kk_famille_trg_parent();

-- Rattrapage : contrats déjà signés avant la mise en place (une fois).
select public.kk_famille_creer_acces(enfant_id)
from (select distinct enfant_id from public.contrats
      where enfant_id is not null and statut in ('signe', 'contresigne')) t;

select count(*) as acces_actifs from public.famille_acces where actif;
