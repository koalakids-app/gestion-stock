-- ============================================================================
-- Module Couches (stock.html) — décompte automatique depuis le suivi
-- ============================================================================
-- Objectif : suivre le stock de couches par crèche sans demander à l'équipe
-- la moindre saisie supplémentaire. Chaque « Change » déjà enregistré dans
-- le suivi de l'enfant (suivi.html, table suivi_saisies — voir
-- sql/37b_suivi_saisies.sql et sql/37g_suivi_fonctions.sql) vaut une couche
-- utilisée ; un trigger sur suivi_saisies décrémente le stock de l'article
-- porté par l'enfant (enfants.taille_couche + enfants.type_couche, voir
-- sql/enfants_taille_couche.sql), sans passer par le client.
--
-- Deux familles d'articles, deux colonnes qui les distinguent :
--   - type_couche 'couche'  : couche classique, tailles 3/4/5/6.
--   - type_couche 'culotte' : couche-culotte, tailles 4/5 uniquement
--     (apprentissage de la propreté).
--
-- Deux tables :
--   - stock_couches            : le stock courant, une ligne par
--     crèche × type × taille.
--   - stock_couches_mouvements : le journal de tous les mouvements (réception
--     manuelle, ajustement manuel, décompte automatique, annulation d'un
--     change annulé dans les 10 s côté tablette). Sert à la fois d'audit et
--     de base pour estimer la consommation moyenne / jour (alerte J-15).
--
-- `creche` est un texte (nom de la crèche), pas un creche_id : c'est la
-- convention déjà utilisée par `articles.creche` dans stock.html, qui ne
-- charge pas la table `creches` et travaille avec les noms en dur (CRECHES).
-- Le trigger fait la traduction creche_id → nom au moment de l'écriture.
-- ============================================================================

create table if not exists public.stock_couches (
  id                  uuid primary key default gen_random_uuid(),
  creche              text not null,
  type_couche         text not null default 'couche' check (type_couche in ('couche','culotte')),
  taille              text not null check (taille in ('3','4','5','6')),
  stock               integer not null default 0,
  seuil_alerte_jours  integer not null default 15,
  updated_at          timestamptz not null default now(),
  unique (creche, type_couche, taille)
);

alter table public.stock_couches drop constraint if exists stock_couches_type_taille_chk;
alter table public.stock_couches
  add constraint stock_couches_type_taille_chk
  check (type_couche <> 'culotte' or taille in ('4','5'));

create table if not exists public.stock_couches_mouvements (
  id                  uuid primary key default gen_random_uuid(),
  creche              text not null,
  type_couche         text not null default 'couche' check (type_couche in ('couche','culotte')),
  taille              text not null check (taille in ('3','4','5','6')),
  delta               integer not null,
  motif               text not null check (motif in (
                          'reception', 'ajustement', 'change_auto', 'annulation_change'
                        )),
  enfant_id           uuid references public.enfants(id) on delete set null,
  -- Pas de FK vers suivi_saisies : cette ligne doit survivre à la
  -- suppression d'une saisie (annulation 10 s), qui est justement ce que le
  -- trigger ci-dessous consulte pour reverser le bon mouvement.
  saisie_id           uuid,
  auteur_referent_id  uuid references public.referents(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists stock_couches_mouvements_creche_idx
  on public.stock_couches_mouvements (creche, type_couche, taille, created_at desc);

create index if not exists stock_couches_mouvements_saisie_idx
  on public.stock_couches_mouvements (saisie_id) where saisie_id is not null;

alter table public.stock_couches enable row level security;
alter table public.stock_couches_mouvements enable row level security;

-- Même principe que suivi_saisies (37b) : direction (referents.creche_id
-- null) voit tout, une référente scopée ne voit que sa crèche — via le nom,
-- faute de creche_id sur ces deux tables.
create policy stock_couches_select on public.stock_couches
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      left join public.creches c on c.id = r.creche_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or c.name = stock_couches.creche)
    )
  );

create policy stock_couches_insert on public.stock_couches
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      left join public.creches c on c.id = r.creche_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or c.name = stock_couches.creche)
    )
  );

create policy stock_couches_update on public.stock_couches
  for update to authenticated
  using (
    exists (
      select 1 from public.referents r
      left join public.creches c on c.id = r.creche_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or c.name = stock_couches.creche)
    )
  )
  with check (
    exists (
      select 1 from public.referents r
      left join public.creches c on c.id = r.creche_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or c.name = stock_couches.creche)
    )
  );

grant select, insert, update on public.stock_couches to authenticated;

create policy stock_couches_mouvements_select on public.stock_couches_mouvements
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      left join public.creches c on c.id = r.creche_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or c.name = stock_couches_mouvements.creche)
    )
  );

-- Insertion manuelle (réception, ajustement) depuis stock.html. Les lignes
-- automatiques (change_auto/annulation_change) sont écrites par le trigger
-- ci-dessous, en SECURITY DEFINER, donc pas concernées par cette policy.
create policy stock_couches_mouvements_insert on public.stock_couches_mouvements
  for insert to authenticated
  with check (
    motif in ('reception', 'ajustement')
    and exists (
      select 1 from public.referents r
      left join public.creches c on c.id = r.creche_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or c.name = stock_couches_mouvements.creche)
    )
  );

grant select, insert on public.stock_couches_mouvements to authenticated;

-- ----------------------------------------------------------------------------
-- Trigger : un « Change » saisi dans le suivi = une couche décomptée.
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER : suivi_saisies est alimentée aussi bien par la fonction
-- kiosque (kk_suivi_kiosk_saisir, elle-même SECURITY DEFINER, sql/37g) que
-- par une insertion directe « ordinateur » d'une référente authentifiée —
-- dans les deux cas, l'auteur de la saisie n'a pas forcément de droit
-- d'écriture direct sur stock_couches_mouvements pour le motif automatique,
-- d'où l'exécution avec les privilèges du propriétaire de la fonction.
--
-- AFTER DELETE : gère l'annulation 10 s côté tablette (kk_suivi_kiosk_annuler,
-- sql/37k) — un vrai DELETE sur suivi_saisies, donc ce trigger le voit et
-- recrédite la couche décomptée par erreur.
-- ============================================================================
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

    select name into v_creche from public.creches where id = new.creche_id;
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

drop trigger if exists trg_stock_couches_change on public.suivi_saisies;
create trigger trg_stock_couches_change
  after insert or delete on public.suivi_saisies
  for each row execute function public.kk_stock_couches_appliquer_saisie();

-- ----------------------------------------------------------------------------
-- Vérification
-- ----------------------------------------------------------------------------
select
  (select count(*) from public.stock_couches) as nb_lignes_stock,
  (select count(*) from pg_policies where schemaname='public' and tablename='stock_couches') as nb_policies_stock,
  (select count(*) from pg_policies where schemaname='public' and tablename='stock_couches_mouvements') as nb_policies_mvts,
  (select count(*) from pg_trigger where tgname = 'trg_stock_couches_change') as nb_trigger;
