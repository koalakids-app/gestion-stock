-- ============================================================================
-- Durcissement des buckets `documents-admin` et `carnets`
-- ============================================================================
-- Même principe que sql/employes_documents_bucket_hardening.sql, appliqué
-- aux deux buckets du module famille/enfant :
--
-- - documents-admin : pièces administratives déposées par les familles
--   (dossiers_pieces / pieces.html) ou importées directement par une
--   référente depuis la fiche enfant (js/enfants.js).
-- - carnets : photocopies du carnet de vaccination, importées directement
--   par une référente (js/vaccinations.js) — pas de lien public pour ce
--   bucket, mais la même restriction de format s'applique.
--
-- allowed_mime_types : seuls les formats attendus pour ces pièces
-- (photos/scans + PDF) sont acceptés à l'upload.
-- file_size_limit : 8 Mo, aligné sur MAX_BYTES déjà vérifié côté edge
-- function `dossier-pieces` pour documents-admin — sans ceci, l'import
-- direct par une référente (qui passe directement par le SDK Storage, sans
-- cette vérification côté application) n'était pas plafonné sur aucun des
-- deux buckets.
-- ============================================================================

update storage.buckets
set file_size_limit = 8388608,  -- 8 Mo
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'application/pdf'
    ]
where id in ('documents-admin', 'carnets');
