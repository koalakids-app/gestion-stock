-- Frais IK : la direction doit lire/écrire les lignes des autres membres de la direction,
-- qui n'ont pas de crèche (referents.creche_id IS NULL). Les policies exigeaient
-- creche_id dans les crèches de l'organisation -> lignes invisibles d'un compte direction
-- à l'autre (totaux différents, upsert refusé). On rattache via referents.org_id.
-- frais_ik_lignes.referent_id est de type text.

drop policy if exists ik_lignes_select on public.frais_ik_lignes;
create policy ik_lignes_select on public.frais_ik_lignes
for select using (
  (est_direction() and exists (
     select 1 from public.referents r
     where r.id::text = frais_ik_lignes.referent_id and r.org_id = kk_mon_org()))
  or referent_id in (select r.id::text from public.referents r where r.user_id = auth.uid())
);

drop policy if exists ik_lignes_write on public.frais_ik_lignes;
create policy ik_lignes_write on public.frais_ik_lignes
for all using (
  (est_direction() and exists (
     select 1 from public.referents r
     where r.id::text = frais_ik_lignes.referent_id and r.org_id = kk_mon_org()))
  or referent_id in (select r.id::text from public.referents r where r.user_id = auth.uid())
) with check (
  (est_direction() and exists (
     select 1 from public.referents r
     where r.id::text = frais_ik_lignes.referent_id and r.org_id = kk_mon_org()))
  or referent_id in (select r.id::text from public.referents r where r.user_id = auth.uid())
);
