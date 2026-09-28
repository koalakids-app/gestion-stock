-- ============================================================================
-- Multi-tenant : evenements.org_id sans trigger, découvert via signalement
-- utilisateur (création d'évènement impossible, erreur 23502)
-- ============================================================================
-- evenements.org_id est NOT NULL, mais rien ne le renseignait à l'insertion :
-- le front (demandes.html / saveEvenement()) n'envoie jamais ce champ, en
-- confiance que la base s'en charge — ce qu'elle ne faisait pas pour cette
-- table. Conséquence réelle : impossible de créer un évènement, l'erreur
-- Postgres (23502 "null value in column org_id violates not-null
-- constraint") n'étant même pas affichée à l'utilisateur (cf. commit
-- corrigeant l'affichage du message d'erreur dans saveEvenement()).
--
-- Même classe de bug que fournisseurs.org_id et reseau_config.id /
-- frais_ik_config.id (sessions précédentes) : un champ obligatoire côté
-- schéma que le code applicatif ne pose jamais, découvert seulement quand
-- quelqu'un déclenche le chemin qui en a besoin.
--
-- Corrigé par un trigger BEFORE INSERT (plutôt qu'un DEFAULT, org_id n'étant
-- pas déductible d'une constante mais de la session de l'appelant·e) qui
-- reprend le même principe que kk_mon_org() : résoudre l'organisation via la
-- fiche `referents` de la personne connectée, sans jamais écraser une valeur
-- déjà fournie.
--
-- Appliqué directement en prod via Supabase MCP, documenté ici après coup
-- pour traçabilité.
-- ============================================================================

create or replace function public.evenements_set_org_id()
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
for each row execute function public.evenements_set_org_id();
