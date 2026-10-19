-- ============================================================================
-- Messages à sens unique de la direction / des référent·es vers les employé·es
-- ============================================================================
-- Un·e employé·e n'a plus accès à Demandes (kkRenvoiEmploye) : il/elle lit ses
-- messages dans « Mon espace » (collaborateur.html) et peut s'abonner aux
-- notifications push depuis cette page.
--
--  - messages_employes               : le message (titre, corps, auteur, crèche visée).
--  - messages_employes_destinataires : une ligne par employé·e destinataire + date de lecture.
--  - push_subscriptions              : accepte désormais un employe_id (au lieu d'un referent_id).
--  - RPC upsert_push_subscription    : sait aussi enregistrer l'abonnement d'un·e employé·e.
--  - RPC supprimer_push_subscription : retire l'abonnement de CET appareil (référent·e ou employé·e).
--  - RPC marquer_message_employe_lu  : l'employé·e marque son message comme lu.
--
-- Accès : direction = toute son organisation, référent·e = les employé·es de sa
-- crèche (kk_acces_creche_gestion), employé·e = uniquement ses propres messages.
-- Les fonctions SECURITY DEFINER évitent la récursion RLS entre les deux tables.
-- À appliquer à la main sur Supabase (une instruction à la fois si l'éditeur expire).
-- ============================================================================

-- ---------- fonctions d'aide ------------------------------------------------

create or replace function public.kk_mon_employe()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from public.employes where user_id = auth.uid() limit 1
$$;

create or replace function public.kk_mon_referent()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from public.referents where user_id = auth.uid() limit 1
$$;

-- ---------- tables ----------------------------------------------------------

create table if not exists public.messages_employes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid default public.kk_mon_org(),
  creche_id uuid references public.creches(id),   -- null = plusieurs crèches (direction)
  auteur_id uuid not null references public.referents(id),
  auteur_nom text not null default '',
  titre text not null,
  corps text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.messages_employes_destinataires (
  message_id uuid not null references public.messages_employes(id) on delete cascade,
  employe_id uuid not null references public.employes(id) on delete cascade,
  lu_le timestamptz,
  primary key (message_id, employe_id)
);

create index if not exists messages_employes_dest_employe
  on public.messages_employes_destinataires (employe_id, lu_le);

alter table public.messages_employes enable row level security;
alter table public.messages_employes_destinataires enable row level security;

-- ---------- fonctions utilisées par les policies ----------------------------

create or replace function public.kk_message_employes_gere(p_msg uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.messages_employes m
    where m.id = p_msg
      and m.org_id = public.kk_mon_org()
      and (public.kk_est_direction() or public.kk_acces_creche_gestion(m.creche_id))
  )
$$;

create or replace function public.kk_message_employes_auteur(p_msg uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.messages_employes m
    where m.id = p_msg and m.auteur_id = public.kk_mon_referent()
  )
$$;

create or replace function public.kk_message_employes_destinataire(p_msg uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.messages_employes_destinataires d
    where d.message_id = p_msg and d.employe_id = public.kk_mon_employe()
  )
$$;

-- ---------- policies --------------------------------------------------------

-- Pas de sous-requête sur la table elle-même : un INSERT ... RETURNING (utilisé par
-- dbInsert) doit pouvoir relire la ligne qu'il vient de créer, que la fonction
-- kk_message_employes_gere ne voit pas encore (même instruction).
drop policy if exists messages_employes_select_gestion on public.messages_employes;
create policy messages_employes_select_gestion on public.messages_employes
  for select to authenticated
  using (
    org_id = public.kk_mon_org()
    and (public.kk_est_direction() or public.kk_acces_creche_gestion(creche_id))
  );

drop policy if exists messages_employes_select_destinataire on public.messages_employes;
create policy messages_employes_select_destinataire on public.messages_employes
  for select to authenticated
  using (public.kk_message_employes_destinataire(id));

drop policy if exists messages_employes_insert on public.messages_employes;
create policy messages_employes_insert on public.messages_employes
  for insert to authenticated
  with check (
    auteur_id = public.kk_mon_referent()
    and org_id = public.kk_mon_org()
    and (public.kk_est_direction() or public.kk_acces_creche_gestion(creche_id))
  );

drop policy if exists messages_employes_dest_select on public.messages_employes_destinataires;
create policy messages_employes_dest_select on public.messages_employes_destinataires
  for select to authenticated
  using (employe_id = public.kk_mon_employe() or public.kk_message_employes_gere(message_id));

drop policy if exists messages_employes_dest_insert on public.messages_employes_destinataires;
create policy messages_employes_dest_insert on public.messages_employes_destinataires
  for insert to authenticated
  with check (
    public.kk_message_employes_auteur(message_id)
    and exists (
      select 1 from public.employes e
      where e.id = employe_id and public.kk_acces_creche_gestion(e.creche_id)
    )
  );

-- Lecture : pas de policy update, l'employé·e passe par la RPC ci-dessous.
create or replace function public.marquer_message_employe_lu(p_message uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.messages_employes_destinataires
     set lu_le = now()
   where message_id = p_message
     and employe_id = public.kk_mon_employe()
     and lu_le is null
$$;

grant execute on function public.marquer_message_employe_lu(uuid) to authenticated;

-- ---------- abonnements push des employé·es ---------------------------------

alter table public.push_subscriptions alter column referent_id drop not null;

alter table public.push_subscriptions
  add column if not exists employe_id uuid references public.employes(id) on delete cascade;

alter table public.push_subscriptions drop constraint if exists push_subscriptions_personne_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_personne_check
  check (referent_id is not null or employe_id is not null);

-- Remplace la version de sql/push_subscriptions_reassign_rpc.sql : si le compte
-- n'est pas un·e référent·e, on cherche une fiche employé·e. Un endpoint ne
-- pouvant appartenir qu'à une personne à la fois, l'autre identifiant est remis à null.
create or replace function public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_user_agent text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_referent_id uuid;
  v_employe_id uuid;
begin
  select id into v_referent_id from public.referents where user_id = auth.uid();
  if v_referent_id is null then
    select id into v_employe_id from public.employes where user_id = auth.uid();
  end if;
  if v_referent_id is null and v_employe_id is null then
    return;
  end if;

  insert into public.push_subscriptions (referent_id, employe_id, endpoint, p256dh, auth_key, user_agent)
  values (v_referent_id, v_employe_id, p_endpoint, p_p256dh, p_auth_key, p_user_agent)
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh,
    auth_key = excluded.auth_key,
    user_agent = excluded.user_agent,
    referent_id = excluded.referent_id,
    employe_id = excluded.employe_id;
end;
$function$;

grant execute on function public.upsert_push_subscription(text, text, text, text) to authenticated;

-- Désactivation sur CET appareil uniquement (voir toggleNotificationsPush).
create or replace function public.supprimer_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  delete from public.push_subscriptions
   where endpoint = p_endpoint
     and (referent_id = public.kk_mon_referent() or employe_id = public.kk_mon_employe())
$$;

grant execute on function public.supprimer_push_subscription(text) to authenticated;
