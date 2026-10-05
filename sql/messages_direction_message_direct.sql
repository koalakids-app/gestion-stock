-- ============================================================================
-- Messagerie : la direction peut répondre dans le fil d'un message direct
-- ============================================================================
-- Un message direct (sans crèche : demandes.creche_id IS NULL) n'était pas
-- couvert par la politique `msg_direction` de `messages`, qui exigeait que la
-- crèche de la demande appartienne à l'organisation (NULL IN (...) = faux).
-- Résultat : « Erreur envoi » quand la direction répondait dans un tel fil.
-- On aligne la condition sur `direction_all_demandes` (demandes.org_id).
-- ============================================================================

drop policy if exists msg_direction on public.messages;
create policy msg_direction on public.messages
  for all
  using (
    kk_est_direction() and exists (
      select 1 from public.demandes d
      where d.id = messages.demande_id
        and (
          d.org_id = kk_mon_org()
          or d.creche_id in (select c.id from public.creches c where c.org_id = kk_mon_org())
        )
    )
  )
  with check (
    kk_est_direction() and exists (
      select 1 from public.demandes d
      where d.id = messages.demande_id
        and (
          d.org_id = kk_mon_org()
          or d.creche_id in (select c.id from public.creches c where c.org_id = kk_mon_org())
        )
    )
  );
