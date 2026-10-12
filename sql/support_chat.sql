-- ============================================================================
-- Chat d'assistance en direct (js/support-chat.js)
-- ============================================================================
-- Une bulle de discussion flottante sur toutes les pages de l'appli permet à
-- un membre de l'équipe (référent·e, directeur/trice, collaborateur/trice) de
-- signaler un problème d'utilisation. La direction de son organisation voit
-- toutes les conversations dans la même bulle et répond en direct.
--
-- Une conversation = tous les messages partageant le même
-- `conversation_user_id` (le compte qui a posé la question).
--   * le membre de l'équipe ne voit et n'écrit que dans SA conversation ;
--   * la direction voit/écrit dans les conversations de SON organisation.
--
-- Pas de colonne « lu » modifiable par tout le monde : le marquage « lu » passe
-- par deux fonctions qui ne touchent que le bon côté de la conversation.
-- ============================================================================

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisations(id) on delete cascade,
  conversation_user_id uuid not null references auth.users(id) on delete cascade,
  auteur_id uuid not null references auth.users(id) on delete cascade,
  auteur_nom text,
  -- true = réponse de la direction, false = message du membre de l'équipe
  from_support boolean not null default false,
  contenu text not null check (length(btrim(contenu)) > 0 and length(contenu) <= 4000),
  -- contexte automatique pour aider au diagnostic
  page text,
  appareil text,
  lu_par_support boolean not null default false,
  lu_par_utilisateur boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_conv_idx
  on public.support_messages (conversation_user_id, created_at);
create index if not exists support_messages_org_idx
  on public.support_messages (org_id, created_at desc);

-- org_id résolu côté serveur (le front ne l'envoie jamais), comme les autres tables.
create or replace function public.support_messages_set_org_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.org_id is null then
    new.org_id := public.kk_mon_org();
  end if;
  -- Le sens du message et son statut de lecture ne se déclarent pas côté client :
  -- un message de la direction est « lu » par la direction, un message d'un
  -- membre de l'équipe est « lu » par lui-même.
  if new.from_support then
    new.lu_par_support := true;
    new.lu_par_utilisateur := false;
  else
    new.lu_par_support := false;
    new.lu_par_utilisateur := true;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_support_messages_set_org_id on public.support_messages;
create trigger trg_support_messages_set_org_id
before insert on public.support_messages
for each row execute function public.support_messages_set_org_id();

alter table public.support_messages enable row level security;

-- Membre de l'équipe : sa propre conversation uniquement.
drop policy if exists support_messages_select_self on public.support_messages;
create policy support_messages_select_self on public.support_messages
  for select to authenticated
  using (conversation_user_id = auth.uid());

drop policy if exists support_messages_insert_self on public.support_messages;
create policy support_messages_insert_self on public.support_messages
  for insert to authenticated
  with check (
    conversation_user_id = auth.uid()
    and auteur_id = auth.uid()
    and from_support = false
  );

-- Direction : toutes les conversations de son organisation.
drop policy if exists support_messages_select_direction on public.support_messages;
create policy support_messages_select_direction on public.support_messages
  for select to authenticated
  using (public.kk_est_direction() and org_id = public.kk_mon_org());

drop policy if exists support_messages_insert_direction on public.support_messages;
create policy support_messages_insert_direction on public.support_messages
  for insert to authenticated
  with check (
    public.kk_est_direction()
    and auteur_id = auth.uid()
    and from_support = true
    and exists (
      select 1 from public.support_messages m
      where m.conversation_user_id = support_messages.conversation_user_id
        and m.org_id = public.kk_mon_org()
    )
  );

-- Suppression d'une conversation (ménage) : direction de l'organisation.
drop policy if exists support_messages_delete_direction on public.support_messages;
create policy support_messages_delete_direction on public.support_messages
  for delete to authenticated
  using (public.kk_est_direction() and org_id = public.kk_mon_org());

-- Pas de policy UPDATE : le « lu » passe par ces deux fonctions.
create or replace function public.kk_support_marquer_lu_utilisateur()
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.support_messages
     set lu_par_utilisateur = true
   where conversation_user_id = auth.uid()
     and from_support
     and not lu_par_utilisateur;
$$;

create or replace function public.kk_support_marquer_lu_support(p_conversation_user_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.support_messages
     set lu_par_support = true
   where conversation_user_id = p_conversation_user_id
     and org_id = public.kk_mon_org()
     and public.kk_est_direction()
     and not from_support
     and not lu_par_support;
$$;

revoke all on function public.kk_support_marquer_lu_utilisateur() from public;
revoke all on function public.kk_support_marquer_lu_support(uuid) from public;
grant execute on function public.kk_support_marquer_lu_utilisateur() to authenticated;
grant execute on function public.kk_support_marquer_lu_support(uuid) to authenticated;

-- Temps réel (facultatif : sans lui, le chat se met à jour par interrogation
-- régulière toutes les quelques secondes).
do $$
begin
  alter publication supabase_realtime add table public.support_messages;
exception when others then
  null;
end $$;
