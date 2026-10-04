-- ============================================================================
-- Validation par le/la collaborateur/trice d'une micro-formation lue/faite
-- ============================================================================
-- Une micro-formation n'a pas de score : rien ne prouvait donc qu'elle avait
-- été lue tant que le module quiz-protocoles n'enregistrait pas la lecture.
-- Le/la collaborateur/trice peut maintenant la valider lui/elle-même depuis
-- "Mon espace" (bouton « J'ai lu et fait cette formation »). La validation
-- est horodatée dans formations_envois.valide_le.
-- ============================================================================

alter table public.formations_envois
  add column if not exists valide_le timestamptz;

-- Seule la colonne valide_le est modifiable par un utilisateur connecté.
revoke update on public.formations_envois from authenticated;
grant update (valide_le) on public.formations_envois to authenticated;

create policy formations_envois_valider_self_employe on public.formations_envois
  for update to authenticated
  using (exists (select 1 from public.employes e where e.id = formations_envois.employe_id and e.user_id = auth.uid()))
  with check (exists (select 1 from public.employes e where e.id = formations_envois.employe_id and e.user_id = auth.uid()));

create policy formations_envois_valider_self_referent on public.formations_envois
  for update to authenticated
  using (exists (select 1 from public.referents r where r.id = formations_envois.referent_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.referents r where r.id = formations_envois.referent_id and r.user_id = auth.uid()));
