-- Un·e directeur/trice technique (role 'referent') peut supprimer les fiches
-- enfants de SA crèche (la direction le pouvait déjà via direction_all_enfants).
-- Les tables liées (présences, contrats, parents, pièces…) sont en CASCADE ou
-- SET NULL : la suppression n'est bloquée par aucune clé étrangère.
create policy enf_delete on public.enfants for delete to authenticated
  using (kk_mon_role() = 'referent'::text and creche_id = kk_ma_creche());
