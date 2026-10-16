-- Bucket privé `sante` : les employés peuvent déposer et consulter les ordonnances
-- (dossier `ordonnances/<id crèche>_…`) de LEUR crèche uniquement. Le reste du bucket
-- (PAI, etc.) reste réservé à la direction et aux référentes. À appliquer à la main.
create policy sante_ordonnances_employe_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sante'
    and exists (
      select 1 from public.referents r
      where r.user_id = auth.uid() and r.role = 'employe'
        and starts_with(name, 'ordonnances/' || r.creche_id::text || '_')
    )
  );

create policy sante_ordonnances_employe_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'sante'
    and exists (
      select 1 from public.referents r
      where r.user_id = auth.uid() and r.role = 'employe'
        and starts_with(name, 'ordonnances/' || r.creche_id::text || '_')
    )
  );
