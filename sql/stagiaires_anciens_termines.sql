-- Anciens stages : les fiches encore « accepté » ou « en cours » dont la date de fin
-- est passée passent en « terminé » (rattrapage ponctuel ; pour la suite, l'application
-- le fait seule quand l'appréciation de l'évaluation est remplie).
-- À appliquer à la main sur le projet juyrceadazrovlitxceb.

-- 1. Contrôle : les fiches concernées
select id, prenom, nom, statut, date_fin
from stagiaires
where statut in ('accepte','en_cours')
  and date_fin < current_date
order by date_fin;

-- 2. Mise à jour
update stagiaires
set statut = 'termine'
where statut in ('accepte','en_cours')
  and date_fin < current_date;
