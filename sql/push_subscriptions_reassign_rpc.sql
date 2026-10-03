-- ============================================================================
-- push_subscriptions : réassignation d'abonnement sur poste partagé
-- ============================================================================
-- L'endpoint d'une souscription push est propre au NAVIGATEUR, pas à la
-- personne connectée. Sur un poste partagé (tablette), quand un·e référent·e
-- active les notifications après qu'un·e autre l'ait fait avant elle depuis
-- le même navigateur, l'upsert direct (onConflict: endpoint) tente une
-- UPDATE sur une ligne qui appartient encore à la personne précédente — bloqué
-- par la policy push_subscriptions_own_update ("new row violates row-level
-- security policy (USING expression)"). Repéré via la surveillance
-- post-déploiement (3 occurrences le 03/10/2026).
--
-- Corrigé par une RPC SECURITY DEFINER : le referent_id n'est jamais fourni
-- par le client (dérivé de auth.uid() côté serveur, donc impossible d'enregistrer
-- un abonnement au nom d'un autre compte), et l'upsert réassigne explicitement
-- la ligne à la personne qui vient de s'abonner — un endpoint ne pouvant de
-- toute façon être associé qu'à un seul navigateur à la fois, c'est le
-- comportement voulu.
--
-- Appelée depuis demandes.html (activerNotifs, checkNotifSubscription) via
-- sb.rpc('upsert_push_subscription', {p_endpoint, p_p256dh, p_auth_key, p_user_agent})
-- à la place de sb.from('push_subscriptions').upsert(...).
-- ============================================================================

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
begin
  select id into v_referent_id from public.referents where user_id = auth.uid();
  if v_referent_id is null then
    return;
  end if;

  insert into public.push_subscriptions (referent_id, endpoint, p256dh, auth_key, user_agent)
  values (v_referent_id, p_endpoint, p_p256dh, p_auth_key, p_user_agent)
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh,
    auth_key = excluded.auth_key,
    user_agent = excluded.user_agent,
    referent_id = excluded.referent_id;
end;
$function$;

grant execute on function public.upsert_push_subscription(text, text, text, text) to authenticated;
