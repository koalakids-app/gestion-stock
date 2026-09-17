-- ============================================================================
-- Alerte de sécurité : connexion depuis un appareil/navigateur jamais vu
-- ============================================================================
-- Chaque connexion réussie (mot de passe + MFA validés) enregistre un
-- identifiant d'appareil (généré côté client, stocké en localStorage) dans
-- `login_events`. La fonction `kk_enregistrer_connexion` répond `true` la
-- première fois qu'un couple (user, device) apparaît : c'est ce signal que
-- le client utilise pour déclencher l'alerte (push + email), via l'edge
-- function `envoyer-alerte-connexion`. Un rejeu du même appareil ne redéclenche
-- jamais l'alerte.
-- ============================================================================

create table if not exists public.login_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  device_id   text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists login_events_user_device_idx
  on public.login_events(user_id, device_id);

alter table public.login_events enable row level security;

create policy login_events_select_self on public.login_events
  for select to authenticated
  using (user_id = auth.uid());

create policy login_events_insert_self on public.login_events
  for insert to authenticated
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Enregistre la connexion courante et indique si cet appareil est nouveau
-- pour ce compte (jamais vu dans login_events avant cet appel).
-- ----------------------------------------------------------------------------
create or replace function public.kk_enregistrer_connexion(p_device_id text, p_user_agent text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deja_connu boolean;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;

  select exists(
    select 1 from public.login_events
    where user_id = auth.uid() and device_id = p_device_id
  ) into v_deja_connu;

  insert into public.login_events(user_id, device_id, user_agent)
  values (auth.uid(), p_device_id, p_user_agent);

  return not v_deja_connu;
end;
$$;

revoke all on function public.kk_enregistrer_connexion(text, text) from public;
grant execute on function public.kk_enregistrer_connexion(text, text) to authenticated;
