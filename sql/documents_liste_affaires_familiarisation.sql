-- ============================================================================
-- Documents : ajoute « Liste des affaires à apporter » au dossier de
-- familiarisation envoyé aux familles (rubrique « À consulter » de famille.html).
-- ============================================================================
-- À exécuter dans le SQL Editor Supabase (après le déploiement du PDF
-- documents-pack/liste-affaires-a-apporter.pdf). Idempotent.
-- fichier_url est relatif : famille.html et documents.html sont à la racine du site.
-- Le Word d'origine est conservé dans documents-pack/ pour les modifications.
-- ============================================================================

do $$
declare
  o record;
begin
  for o in select id from public.organisations loop
    if not exists (
      select 1 from public.documents_koala
       where org_id = o.id and fichier_nom = 'liste-affaires-a-apporter.pdf' and actif is not false
    ) then
      insert into public.documents_koala
        (org_id, titre, description, creche_id, type, fichier_url, fichier_nom,
         pack_familiarisation, pack_ordre, pack_imprimer)
      values
        (o.id,
         'Liste des affaires à apporter',
         'À préparer pour la familiarisation : biberons, couches, tenues de rechange, etc.',
         null, 'fichier', 'documents-pack/liste-affaires-a-apporter.pdf', 'liste-affaires-a-apporter.pdf',
         true, 90, false);
    end if;
  end loop;
end $$;
