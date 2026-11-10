-- Dossiers collaborateurs déjà archivés avant le 10 novembre 2026 : retirer leurs codes de pointage
-- (à appliquer à la main). Désormais, archiver une fiche vide ces deux colonnes (Demandes › Collaborateurs › Compte) :
-- la tablette de pointage ne reconnaît plus la personne. Un code image est à régénérer à la réactivation.
update public.employes
   set code_pictos = null, code_pointage = null
 where archive_le is not null
   and (code_pictos is not null or code_pointage is not null);
