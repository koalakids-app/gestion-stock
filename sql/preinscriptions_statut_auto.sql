-- ============================================================================
-- Devis : le statut de la demande suit ses devis et ses contrats
-- ============================================================================
-- Jusqu'ici, preinscriptions.statut ne bougeait qu'à la main : un devis
-- accepté ou un contrat refusé par la famille (depuis son téléphone, via
-- l'Edge Function dossier-contrat) laissait la demande en « Devis envoyé ».
-- Elle manquait alors aux compteurs « Refusé » du tableau de bord Devis.
--
-- Règles — le statut n'avance que vers l'avant, jamais au-dessus d'un
-- dossier clos (inscrit / refusé / sans suite posés à la main ou par la
-- bascule) :
--   devis envoyé              → devis_envoye  (depuis nouvelle, en_contact)
--   devis accepté             → accepte       (depuis nouvelle … devis_envoye)
--   contrat signé/contresigné → accepte       (idem)
--   devis refusé, sans autre devis vivant ni contrat → refuse
--   contrat initial refusé, sans autre contrat initial vivant → refuse
-- Le motif de refus reste à préciser par la direction (la fiche l'exige à
-- l'enregistrement) : le motif libre de la famille n'entre pas dans la liste.
-- ============================================================================

create or replace function public.preinscription_statut_suivre()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pid uuid := new.preinscription_id;
begin
  if pid is null then return new; end if;
  if tg_op = 'UPDATE' and new.statut is not distinct from old.statut then return new; end if;

  if tg_table_name = 'devis' then
    if new.statut = 'envoye' then
      update preinscriptions set statut = 'devis_envoye'
       where id = pid and statut in ('nouvelle','en_contact');
    elsif new.statut = 'accepte' then
      update preinscriptions set statut = 'accepte'
       where id = pid and statut in ('nouvelle','en_contact','devis_envoye');
    elsif new.statut = 'refuse'
      and not exists (select 1 from devis d where d.preinscription_id = pid and d.id <> new.id
                      and d.statut in ('brouillon','envoye','accepte'))
      and not exists (select 1 from contrats c where c.preinscription_id = pid
                      and c.statut not in ('refuse','annule','expire')) then
      update preinscriptions set statut = 'refuse'
       where id = pid and statut not in ('inscrit','refuse','sans_suite');
    end if;

  elsif tg_table_name = 'contrats' and new.type = 'initial' then
    if new.statut in ('signe','contresigne') then
      update preinscriptions set statut = 'accepte'
       where id = pid and statut in ('nouvelle','en_contact','devis_envoye');
    elsif new.statut = 'refuse'
      and not exists (select 1 from contrats c where c.preinscription_id = pid and c.id <> new.id
                      and c.type = 'initial' and c.statut in ('brouillon','envoye','signe','contresigne')) then
      update preinscriptions set statut = 'refuse'
       where id = pid and statut not in ('inscrit','refuse','sans_suite');
    end if;
  end if;
  return new;
end $$;

-- Fonction de trigger uniquement : pas d'appel direct depuis l'API.
revoke all on function public.preinscription_statut_suivre() from public, anon, authenticated;

drop trigger if exists devis_statut_suivre on public.devis;
create trigger devis_statut_suivre after insert or update of statut on public.devis
  for each row execute function public.preinscription_statut_suivre();

drop trigger if exists contrats_statut_suivre on public.contrats;
create trigger contrats_statut_suivre after insert or update of statut on public.contrats
  for each row execute function public.preinscription_statut_suivre();

-- Rattrapage des dossiers existants dont le contrat initial a été refusé.
update public.preinscriptions p set statut = 'refuse'
 where p.statut not in ('inscrit','refuse','sans_suite')
   and exists (select 1 from contrats c where c.preinscription_id = p.id and c.type = 'initial' and c.statut = 'refuse')
   and not exists (select 1 from contrats c where c.preinscription_id = p.id and c.type = 'initial'
                   and c.statut in ('brouillon','envoye','signe','contresigne'));
