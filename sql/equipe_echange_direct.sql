-- ============================================================================
-- Échange direct entre personnes connectées (onglet « Équipe » de la bulle koala)
-- ============================================================================
-- Les messages passent par Supabase Realtime « broadcast » sur un canal PRIVÉ
-- `kk-equipe-<org_id>` : rien n'est écrit en base, rien n'est conservé (ni côté
-- serveur, ni côté écran après fermeture de la bulle).
-- Ces deux policies réservent le canal aux comptes direction / référent·es de
-- la MÊME organisation (sans elles, l'abonnement au canal privé est refusé et
-- l'onglet affiche « Échange direct indisponible »).
--
-- À appliquer à la main sur Supabase (projet juyrceadazrovlitxceb).
-- ============================================================================

drop policy if exists "kk_equipe_echange_lecture" on realtime.messages;
create policy "kk_equipe_echange_lecture"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() = 'kk-equipe-' || (
    select r.org_id::text from public.referents r
     where r.user_id = auth.uid() and r.role in ('referent', 'direction')
     limit 1
  )
);

drop policy if exists "kk_equipe_echange_ecriture" on realtime.messages;
create policy "kk_equipe_echange_ecriture"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() = 'kk-equipe-' || (
    select r.org_id::text from public.referents r
     where r.user_id = auth.uid() and r.role in ('referent', 'direction')
     limit 1
  )
);
