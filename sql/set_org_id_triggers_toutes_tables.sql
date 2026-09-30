-- ============================================================================
-- Multi-tenant : org_id NOT NULL sans trigger sur 14 tables (audit du
-- 30/09/2026, suite à documents_koala). Le front n'envoie jamais org_id ;
-- un trigger BEFORE INSERT le résout via kk_mon_org() sans jamais écraser
-- une valeur déjà fournie (même principe que evenements / documents_reponses).
-- Tables à risque (insertion front sans org_id) : creches, doc_categories,
-- frais_annexes, tarifs, stagiaires_docs_types. Les 9 autres par précaution.
-- ============================================================================

create or replace function public.creches_set_org_id()
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

drop trigger if exists trg_creches_set_org_id on public.creches;
create trigger trg_creches_set_org_id
before insert on public.creches
for each row execute function public.creches_set_org_id();

create or replace function public.doc_categories_set_org_id()
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

drop trigger if exists trg_doc_categories_set_org_id on public.doc_categories;
create trigger trg_doc_categories_set_org_id
before insert on public.doc_categories
for each row execute function public.doc_categories_set_org_id();

create or replace function public.frais_annexes_set_org_id()
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

drop trigger if exists trg_frais_annexes_set_org_id on public.frais_annexes;
create trigger trg_frais_annexes_set_org_id
before insert on public.frais_annexes
for each row execute function public.frais_annexes_set_org_id();

create or replace function public.tarifs_set_org_id()
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

drop trigger if exists trg_tarifs_set_org_id on public.tarifs;
create trigger trg_tarifs_set_org_id
before insert on public.tarifs
for each row execute function public.tarifs_set_org_id();

create or replace function public.stagiaires_docs_types_set_org_id()
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

drop trigger if exists trg_stagiaires_docs_types_set_org_id on public.stagiaires_docs_types;
create trigger trg_stagiaires_docs_types_set_org_id
before insert on public.stagiaires_docs_types
for each row execute function public.stagiaires_docs_types_set_org_id();

create or replace function public.cmg_config_set_org_id()
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

drop trigger if exists trg_cmg_config_set_org_id on public.cmg_config;
create trigger trg_cmg_config_set_org_id
before insert on public.cmg_config
for each row execute function public.cmg_config_set_org_id();

create or replace function public.factures_series_set_org_id()
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

drop trigger if exists trg_factures_series_set_org_id on public.factures_series;
create trigger trg_factures_series_set_org_id
before insert on public.factures_series
for each row execute function public.factures_series_set_org_id();

create or replace function public.frais_ik_config_set_org_id()
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

drop trigger if exists trg_frais_ik_config_set_org_id on public.frais_ik_config;
create trigger trg_frais_ik_config_set_org_id
before insert on public.frais_ik_config
for each row execute function public.frais_ik_config_set_org_id();

create or replace function public.padlets_set_org_id()
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

drop trigger if exists trg_padlets_set_org_id on public.padlets;
create trigger trg_padlets_set_org_id
before insert on public.padlets
for each row execute function public.padlets_set_org_id();

create or replace function public.reseau_config_set_org_id()
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

drop trigger if exists trg_reseau_config_set_org_id on public.reseau_config;
create trigger trg_reseau_config_set_org_id
before insert on public.reseau_config
for each row execute function public.reseau_config_set_org_id();

create or replace function public.souscats_set_org_id()
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

drop trigger if exists trg_souscats_set_org_id on public.souscats;
create trigger trg_souscats_set_org_id
before insert on public.souscats
for each row execute function public.souscats_set_org_id();

create or replace function public.stock_config_set_org_id()
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

drop trigger if exists trg_stock_config_set_org_id on public.stock_config;
create trigger trg_stock_config_set_org_id
before insert on public.stock_config
for each row execute function public.stock_config_set_org_id();

create or replace function public.stock_couches_prix_set_org_id()
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

drop trigger if exists trg_stock_couches_prix_set_org_id on public.stock_couches_prix;
create trigger trg_stock_couches_prix_set_org_id
before insert on public.stock_couches_prix
for each row execute function public.stock_couches_prix_set_org_id();

create or replace function public.tarifs_repas_config_set_org_id()
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

drop trigger if exists trg_tarifs_repas_config_set_org_id on public.tarifs_repas_config;
create trigger trg_tarifs_repas_config_set_org_id
before insert on public.tarifs_repas_config
for each row execute function public.tarifs_repas_config_set_org_id();

