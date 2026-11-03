-- ============================================================================
-- Qui est connecté ? (onglet « Équipe » de la bulle koala, js/support-chat.js)
-- ============================================================================
-- Chaque référent·e / direction connecté·e envoie un signal de vie toutes les
-- 60 s (RPC kk_presence_ping). Une seule ligne par personne, pas d'historique.
--   * vu_le      : dernier signal (onglet ouvert, même en arrière-plan)
--   * actif_le   : dernière vraie activité (souris, clavier, toucher)
-- Statut calculé côté écran : en ligne (signal < 2,5 min et activité < 5 min),
-- inactif (signal récent mais pas d'activité), hors ligne (sinon).
--
-- La table n'a AUCUNE policy : tout passe par deux fonctions réservées aux
-- rôles 'referent' et 'direction' (les employés ne sont ni suivis ni listés).
--   * la direction et les référent·es voient tous les comptes direction /
--     référents de l'organisation (statut seulement) ;
--   * la page consultée n'est donnée qu'à la direction.
--
-- À appliquer à la main sur Supabase (projet juyrceadazrovlitxceb).
-- ============================================================================

create table if not exists public.presence_utilisateurs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  org_id     uuid,
  page       text,
  vu_le      timestamptz not null default now(),
  actif_le   timestamptz not null default now()
);
alter table public.presence_utilisateurs enable row level security;
-- volontairement aucune policy : accès uniquement par les fonctions ci-dessous.

-- ----------------------------------------------------------------------------
-- Signal de vie
-- ----------------------------------------------------------------------------
create or replace function public.kk_presence_ping(p_page text, p_actif boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null or coalesce(public.kk_mon_role(), '') not in ('referent', 'direction') then
    return;
  end if;
  select org_id into v_org from public.referents where user_id = auth.uid() limit 1;
  insert into public.presence_utilisateurs (user_id, org_id, page, vu_le, actif_le)
  values (auth.uid(), v_org, left(p_page, 60), now(), now())
  on conflict (user_id) do update
    set org_id   = excluded.org_id,
        page     = excluded.page,
        vu_le    = now(),
        actif_le = case when p_actif then now() else public.presence_utilisateurs.actif_le end;
end;
$$;
revoke all on function public.kk_presence_ping(text, boolean) from public, anon;
grant execute on function public.kk_presence_ping(text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- Liste de l'équipe (tous les comptes direction / référents de l'organisation)
-- ----------------------------------------------------------------------------
create or replace function public.kk_presence_liste()
returns table (
  user_id    uuid,
  nom        text,
  role       text,
  creche_id  uuid,
  creche_nom text,
  page       text,
  vu_le      timestamptz,
  actif_le   timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role  text := coalesce(public.kk_mon_role(), '');
  v_org   uuid;
begin
  if auth.uid() is null or v_role not in ('referent', 'direction') then
    return;
  end if;
  select r.org_id into v_org
    from public.referents r where r.user_id = auth.uid() limit 1;

  return query
  select r.user_id,
         r.name::text,
         r.role::text,
         r.creche_id,
         c.name::text,
         case when v_role = 'direction' then p.page else null end,
         p.vu_le,
         p.actif_le
    from public.referents r
    left join public.creches c on c.id = r.creche_id
    left join public.presence_utilisateurs p on p.user_id = r.user_id
   where r.org_id = v_org
     and r.user_id is not null
     and r.role in ('referent', 'direction')
   order by r.name;
end;
$$;
revoke all on function public.kk_presence_liste() from public, anon;
grant execute on function public.kk_presence_liste() to authenticated;
