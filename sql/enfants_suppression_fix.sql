-- Correctif : la suppression d'une fiche enfant échouait (direction comme directeurs).
--
-- 1) Suppression d'une saisie « change » en cascade : le trigger
--    kk_stock_couches_appliquer_saisie insérait un mouvement
--    'annulation_change' avec enfant_id = l'enfant en cours de suppression ->
--    violation de clé étrangère (stock_couches_mouvements.enfant_id). On
--    n'enregistre plus l'enfant dans ce mouvement lors d'une suppression.
-- 2) registre_infirmerie : la clé étrangère ON DELETE SET NULL tentait de
--    modifier des lignes verrouillées (locked_at) et le trigger de verrouillage
--    refusait. On autorise uniquement le passage de enfant_id à NULL.

create or replace function public.kk_stock_couches_appliquer_saisie()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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

    -- enfant_id volontairement omis : la saisie peut être supprimée en cascade
    -- avec l'enfant, dont la ligne n'existe déjà plus (clé étrangère).
    insert into public.stock_couches_mouvements
      (creche, type_couche, taille, delta, motif, saisie_id, auteur_referent_id)
      values (v_creche, v_type, v_taille, 1, 'annulation_change', old.id, old.auteur_referent_id);

    return old;
  end if;

  return null;
end;
$function$;

create or replace function public.registre_bloque_modif()
returns trigger
language plpgsql
as $function$
begin
  if old.locked_at is not null then
    -- Exception : détachement de l'enfant supprimé (FK ON DELETE SET NULL).
    if old.enfant_id is not null and new.enfant_id is null
       and (to_jsonb(new) - 'enfant_id') = (to_jsonb(old) - 'enfant_id') then
      return new;
    end if;
    raise exception 'Ligne de registre verrouillee le % : modification interdite. Utiliser une rectification.', old.locked_at;
  end if;
  return new;
end;
$function$;
