-- ============================================================================
-- Demandes envoyées à plusieurs destinataires : un seul fil de discussion partagé
-- ============================================================================
-- Une demande groupée reste en N lignes (une par destinataire, `groupe_envoi`).
-- Un message du fil partagé est copié dans la ligne de chaque participant, avec
-- le même `groupe_msg` : chacun le lit dans « sa » ligne (les règles d'accès
-- existantes ne changent pas) et l'application fusionne les copies à l'affichage.
-- À appliquer à la main dans le SQL Editor (projet juyrceadazrovlitxceb).
-- ============================================================================

alter table public.messages add column if not exists groupe_msg uuid;
create index if not exists messages_groupe_msg_idx on public.messages (groupe_msg) where groupe_msg is not null;

create or replace function public.kk_message_groupe(
  p_demande uuid,
  p_body text,
  p_attachments jsonb default '[]'::jsonb
) returns setof public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.kk_mon_ref_id();
  d public.demandes;
  mon_nom text;
  gm uuid := gen_random_uuid();
  pj jsonb := coalesce(p_attachments, '[]'::jsonb);
begin
  if me is null then raise exception 'Non autorisé'; end if;
  select * into d from public.demandes where id = p_demande;
  if not found then raise exception 'Demande introuvable'; end if;

  -- Participant de l'envoi (expéditeur ou destinataire), ou direction de l'organisation.
  if not (
    exists (
      select 1 from public.demandes x
      where (x.id = d.id or (d.groupe_envoi is not null and x.groupe_envoi = d.groupe_envoi))
        and (x.referent_id = me or x.to_referent_id = me)
    )
    or (public.kk_est_direction() and d.org_id = public.kk_mon_org())
  ) then
    raise exception 'Non autorisé';
  end if;

  select name into mon_nom from public.referents where id = me;

  return query
  insert into public.messages (demande_id, author_id, author_name, body, attachments, attachment_url, attachment_name, groupe_msg)
  select x.id, me, coalesce(mon_nom, 'Moi'), coalesce(p_body, ''), pj, pj->0->>'url', pj->0->>'name', gm
  from public.demandes x
  where x.id = d.id or (d.groupe_envoi is not null and x.groupe_envoi = d.groupe_envoi)
  returning *;
end;
$$;

revoke all on function public.kk_message_groupe(uuid, text, jsonb) from public, anon;
grant execute on function public.kk_message_groupe(uuid, text, jsonb) to authenticated;
