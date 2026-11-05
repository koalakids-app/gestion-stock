-- ============================================================================
-- Rôle « employe » : retirer l'accès aux dossiers, à l'espace famille, à l'album (lot 3)
-- ============================================================================
-- Suite des lots 1 et 2 (sql/employe_acces_restreint_lot1.sql). kk_acces_creche()
-- est vrai pour tout profil `referents` de la crèche, rôle `employe` compris.
-- Mesuré en simulant les employés (audit) : un(e) employé(e) lisait des fichiers
-- d'enfants et de stagiaires, les codes d'accès de l'espace famille et les PDF
-- des contrats. On bascule sur kk_acces_creche_gestion (direction + referent).
--
-- Parties (à appliquer une à la fois, dans l'ordre) :
--   1. dossiers de stockage : kk_acces_dossier (buckets documents-admin, carnets,
--      stagiaires) et kk_acces_album (bucket album) ;
--   2. tables : espace famille, album, formations (côté crèche), heures validées ;
--   3. stockage de l'espace famille (bucket famille-docs, storage.objects).
--
-- Inchangé volontairement :
--   * pai, registre_infirmerie, pointages, vaccinations (terrain, règles propres) ;
--   * kk_acces_fichier_pai (bucket sante : l'employé voit les PAI actifs) ;
--   * kiosk_devices : js/pages/terrain.js lit la tablette de la crèche avec la
--     session de l'employé ; à traiter avec une fonction dédiée (jeton non exposé).
--   * formations_envois : l'employé garde ses propres lignes
--     (formations_envois_select_self_employe / valider_self_employe).
--
-- Tester ensuite : compte employé = plus de fichiers dans les buckets ci-dessus,
-- plus de lignes dans famille_*, album_* ; compte referent et direction = comme avant.
-- Retour arrière : mêmes blocs avec le remplacement inverse
--   (kk_acces_creche_gestion( -> kk_acces_creche( ).
-- ============================================================================

-- ---------- Partie 1 : fonctions de filtrage des buckets ----------
create or replace function public.kk_acces_dossier(p_type text, p_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.kk_est_direction()
    or case p_type
         when 'enfant' then exists (
           select 1 from public.enfants e
           where e.id::text = p_id and public.kk_acces_creche_gestion(e.creche_id))
         when 'stagiaire' then exists (
           select 1 from public.stagiaires s
           where s.id::text = p_id
             -- stagiaires.creche_id est de type text (pas uuid) : cast protégé
             and s.creche_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and public.kk_acces_creche_gestion(s.creche_id::uuid))
         else false
       end;
$$;

create or replace function public.kk_acces_album(p_dossier text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.kk_est_direction()
    or (p_dossier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.kk_acces_creche_gestion(p_dossier::uuid));
$$;

-- ---------- Partie 2 : tables ----------
do $$
declare
  r record;
  q text;
  w text;
  sql text;
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'famille_acces','famille_documents','famille_messages','famille_messages_lus',
        'album_accords_signatures','album_journal','album_photos','album_photos_enfants',
        'album_propositions','album_references','album_visages_accord',
        'formations_envois','heures_validations_mensuelles'
      )
      and (qual ilike '%kk_acces_creche(%' or with_check ilike '%kk_acces_creche(%')
  loop
    q := replace(r.qual, 'kk_acces_creche(', 'kk_acces_creche_gestion(');
    w := replace(r.with_check, 'kk_acces_creche(', 'kk_acces_creche_gestion(');
    sql := format('alter policy %I on public.%I', r.policyname, r.tablename);
    if q is not null then sql := sql || ' using (' || q || ')'; end if;
    if w is not null then sql := sql || ' with check (' || w || ')'; end if;
    execute sql;
  end loop;
end $$;

-- ---------- Partie 3 : stockage de l'espace famille ----------
do $$
declare
  r record;
  q text;
  w text;
  sql text;
begin
  for r in
    select policyname, qual, with_check
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'famille_docs_%'
      and (qual ilike '%kk_acces_creche(%' or with_check ilike '%kk_acces_creche(%')
  loop
    q := replace(r.qual, 'kk_acces_creche(', 'kk_acces_creche_gestion(');
    w := replace(r.with_check, 'kk_acces_creche(', 'kk_acces_creche_gestion(');
    sql := format('alter policy %I on storage.objects', r.policyname);
    if q is not null then sql := sql || ' using (' || q || ')'; end if;
    if w is not null then sql := sql || ' with check (' || w || ')'; end if;
    execute sql;
  end loop;
end $$;
