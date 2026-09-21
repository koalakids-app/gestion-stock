-- ============================================================================
-- Durcissement du bucket `documents-employes`
-- ============================================================================
-- À exécuter APRÈS la création du bucket (Storage → New bucket).
--
-- - allowed_mime_types : seuls les formats attendus pour ces pièces
--   (photos/scans + PDF) sont acceptés à l'upload — empêche le dépôt d'un
--   exécutable ou de tout autre format via ce canal, que ce soit par une
--   référente ou via le lien public envoyé au/à la salarié(e).
-- - file_size_limit : 8 Mo, aligné sur MAX_BYTES vérifié côté edge function
--   `dossier-pieces-employe` — sans ceci, l'import direct par une référente
--   (qui passe directement par le SDK Storage, sans cette vérification côté
--   application) n'était pas plafonné.
-- ============================================================================

update storage.buckets
set file_size_limit = 8388608,  -- 8 Mo
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'application/pdf'
    ]
where id = 'documents-employes';
