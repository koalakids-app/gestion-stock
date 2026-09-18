-- ============================================================================
-- Correction : normalisation du nom de crèche dans le module Couches
-- ============================================================================
-- Bug constaté : le trigger de sql/stock_couches.sql lisait `creches.name`
-- tel quel (ex. « Koalakids Toulon Brunet ») pour écrire dans stock_couches /
-- stock_couches_mouvements. Mais stock.html travaille avec des noms courts
-- codés en dur (CRECHES = ['Brunet','Cuers','Ollioules','St Jean','Picot 1',
-- 'Picot 2']), comme le fait déjà `articles.creche`. Résultat : un change
-- décomptait bien une couche en base, mais sous un nom de crèche que
-- l'onglet Couches ne reconnaît pas — la ligne existait, invisible à l'écran.
--
-- Correspondance établie à partir du contenu réel de `creches` :
--   Koalakids Cuers          → Cuers
--   Koalakids Ollioules      → Ollioules
--   Koalakids Toulon Brunet  → Brunet
--   Koalakids Toulon Picot 1 → Picot 1
--   Koalakids Toulon Picot 2 → Picot 2
--   Koalakids Toulon St Jean → St Jean
--
-- Cette table de correspondance est isolée dans une fonction dédiée pour
-- que le trigger l'utilise désormais au lieu du nom brut, et pour pouvoir
-- corriger les lignes déjà écrites avec le mauvais nom.
-- ============================================================================

create or replace function public.kk_stock_couches_nom_court(p_nom text)
returns text
language sql
immutable
as $$
  select case p_nom
    when 'Koalakids Cuers'          then 'Cuers'
    when 'Koalakids Ollioules'      then 'Ollioules'
    when 'Koalakids Toulon Brunet'  then 'Brunet'
    when 'Koalakids Toulon Picot 1' then 'Picot 1'
    when 'Koalakids Toulon Picot 2' then 'Picot 2'
    when 'Koalakids Toulon St Jean' then 'St Jean'
    else p_nom
  end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Trigger corrigé : normalise le nom avant de l'écrire.
-- ----------------------------------------------------------------------------
create or replace function public.kk_stock_couches_appliquer_saisie()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_taille  text;
  v_type    text;
  v_creche  text;
begin
  if tg_op = 'INSERT' then
    if new.type <> 'change' then
      return new;
    end if;

    select taille_couche, coalesce(type_couche, 'couche')
      into v_taille, v_type
      from public.enfants where id = new.enfant_id;
    if v_taille is null then
      return new; -- taille inconnue pour cet enfant : pas de décompte possible
    end if;

    select public.kk_stock_couches_nom_court(name) into v_creche
      from public.creches where id = new.creche_id;
    if v_creche is null then
      return new;
    end if;

    insert into public.stock_couches (creche, type_couche, taille, stock)
      values (v_creche, v_type, v_taille, -1)
      on conflict (creche, type_couche, taille) do update
        set stock = public.stock_couches.stock - 1, updated_at = now();

    insert into public.stock_couches_mouvements
      (creche, type_couche, taille, delta, motif, enfant_id, saisie_id, auteur_referent_id)
      values (v_creche, v_type, v_taille, -1, 'change_auto', new.enfant_id, new.id, new.auteur_referent_id);

    return new;

  elsif tg_op = 'DELETE' then
    if old.type <> 'change' then
      return old;
    end if;

    select creche, type_couche, taille into v_creche, v_type, v_taille
      from public.stock_couches_mouvements
      where saisie_id = old.id and motif = 'change_auto'
      limit 1;

    if v_creche is null then
      return old; -- rien à reverser (déjà annulé, ou saisie sans taille connue)
    end if;

    update public.stock_couches
      set stock = stock + 1, updated_at = now()
      where creche = v_creche and type_couche = v_type and taille = v_taille;

    insert into public.stock_couches_mouvements
      (creche, type_couche, taille, delta, motif, enfant_id, saisie_id, auteur_referent_id)
      values (v_creche, v_type, v_taille, 1, 'annulation_change', old.enfant_id, old.id, old.auteur_referent_id);

    return old;
  end if;

  return null;
end;
$$;

revoke all on function public.kk_stock_couches_appliquer_saisie() from public;

-- ----------------------------------------------------------------------------
-- 2. Rattrapage des lignes déjà écrites sous le nom complet.
-- ----------------------------------------------------------------------------
-- stock_couches_mouvements n'a pas de contrainte d'unicité : simple update.
update public.stock_couches_mouvements
set creche = public.kk_stock_couches_nom_court(creche)
where creche in (
  'Koalakids Cuers', 'Koalakids Ollioules', 'Koalakids Toulon Brunet',
  'Koalakids Toulon Picot 1', 'Koalakids Toulon Picot 2', 'Koalakids Toulon St Jean'
);

-- stock_couches est unique(creche, type_couche, taille) : une ligne au nom
-- complet peut entrer en conflit avec une ligne déjà existante au nom court
-- (ex. créée manuellement via « + Réception »). On fusionne les stocks dans
-- ce cas, sinon on renomme simplement la ligne en place.
do $$
declare
  r record;
  v_court  text;
  v_cible  uuid;
begin
  for r in
    select id, creche, type_couche, taille, stock from public.stock_couches
    where creche in (
      'Koalakids Cuers', 'Koalakids Ollioules', 'Koalakids Toulon Brunet',
      'Koalakids Toulon Picot 1', 'Koalakids Toulon Picot 2', 'Koalakids Toulon St Jean'
    )
  loop
    v_court := public.kk_stock_couches_nom_court(r.creche);

    select id into v_cible from public.stock_couches
      where creche = v_court and type_couche = r.type_couche and taille = r.taille;

    if v_cible is not null then
      update public.stock_couches
        set stock = stock + r.stock, updated_at = now()
        where id = v_cible;
      delete from public.stock_couches where id = r.id;
    else
      update public.stock_couches
        set creche = v_court, updated_at = now()
        where id = r.id;
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Vérification
-- ----------------------------------------------------------------------------
select creche, type_couche, taille, stock from public.stock_couches order by creche, type_couche, taille;
