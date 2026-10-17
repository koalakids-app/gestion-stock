-- Documents ouverts aux employés (rôle `employe`, Accès terrain) : case cochée
-- dans Documents › Modifier le document. À appliquer à la main sur Supabase.
alter table public.documents_koala add column if not exists acces_employe boolean not null default false;

-- Reprise de l'existant : l'autorisation de médicament ponctuelle était déjà proposée sur l'Accès terrain.
update public.documents_koala set acces_employe = true where template_key = 'medicament_ponctuel';
