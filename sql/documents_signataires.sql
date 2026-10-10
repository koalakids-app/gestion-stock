-- ============================================================================
-- Documents signables à distance : catégories concernées + choix du signataire.
-- ============================================================================
-- * doc_categories.signature_distance : les documents « à télécharger » de ces
--   catégories (et de leurs sous-catégories) proposent « Envoyer pour signature ».
--   Activé pour : Protocoles obligatoires, Protocoles médicaux, Protocoles règles
--   d'hygiène. (Les documents marqués documents_koala.signature_distance restent
--   éligibles, ex. protocoles sorties / situations d'urgence d'Ollioules.)
-- * doc_signataires : personnes à qui l'on peut envoyer un document à signer,
--   avec le périmètre de crèches dont elles sont responsables.
--     - Laurence Borodine, RSAI : Ollioules
--     - Pauline Arrighi Gozzo, RSAI : Brunet, Cuers, Picot 1, Picot 2, St Jean
--   Le champ `email` (repris de `partenaires`) pré-remplit le destinataire du bouton « E-mail ».
-- Idempotent pour les colonnes / la table ; les lignes ne sont insérées qu'une fois.
-- ============================================================================

alter table public.doc_categories add column if not exists signature_distance boolean not null default false;

create table if not exists public.doc_signataires (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  nom text not null,
  fonction text,
  perimetre text,
  email text,
  ordre integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.doc_signataires enable row level security;

drop policy if exists doc_signataires_read on public.doc_signataires;
create policy doc_signataires_read on public.doc_signataires
  for select to authenticated using (org_id = public.kk_mon_org());

drop policy if exists doc_signataires_write on public.doc_signataires;
create policy doc_signataires_write on public.doc_signataires
  for all to authenticated
  using (public.is_direction() and org_id = public.kk_mon_org())
  with check (public.is_direction() and org_id = public.kk_mon_org());

create or replace function public.doc_signataires_set_org_id() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin if new.org_id is null then new.org_id := public.kk_mon_org(); end if; return new; end; $$;

drop trigger if exists trg_doc_signataires_set_org_id on public.doc_signataires;
create trigger trg_doc_signataires_set_org_id before insert on public.doc_signataires
  for each row execute function public.doc_signataires_set_org_id();

insert into public.doc_signataires(org_id, nom, fonction, perimetre, ordre)
select '212a5717-7877-4d70-82fd-1a412c1932c1', v.nom, 'RSAI', v.perimetre, v.ordre
from (values
  ('Laurence Borodine',     'Ollioules', 1),
  ('Pauline Arrighi Gozzo', 'Brunet, Cuers, Picot 1, Picot 2, St Jean', 2)
) as v(nom, perimetre, ordre)
where not exists (select 1 from public.doc_signataires s where s.nom = v.nom);

update public.doc_categories set signature_distance = true
 where id in (
   '4291c83e-30df-47f4-8696-d1f15c365427',  -- Protocoles obligatoires
   'ee018c7f-49d6-4eb6-aaf0-5048e15800a8',  -- Protocoles médicaux
   'e06a195f-b685-4c76-a612-0f46841ddff4'   -- Protocoles règles d'hygiène
 );

-- Adresses e-mail : reprises de la table `partenaires` (même nom), uniquement si
-- elles ne sont pas déjà renseignées.
update public.doc_signataires s set email = p.email
  from public.partenaires p
 where lower(p.nom) = lower(s.nom) and s.email is null;
