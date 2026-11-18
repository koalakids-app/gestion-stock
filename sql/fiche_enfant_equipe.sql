-- ============================================================================
-- Accès terrain : fiche enfant en LECTURE SEULE pour l'équipe (rôle employe)
-- ============================================================================
-- La table `enfants` (et ses tables liées) est fermée aux comptes `employe`
-- (audit 2026). Cette fonction rend, pour UN enfant de la crèche de l'appelant,
-- les éléments de la fiche : identité, parents, PAI, vaccinations, pièces
-- (carnet, PAI, documents importés). Les fichiers s'ouvrent ensuite par URL
-- signée : les policies Storage (kk_acces_dossier / kk_acces_fichier_pai)
-- laissent déjà passer toute personne de la crèche.
-- Exclus : codes de pointage / code image, contrats et montants.
-- Aucune écriture. À appliquer à la main, une seule instruction.
-- ============================================================================
create or replace function public.kk_fiche_enfant_equipe(p_enfant uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  e public.enfants;
  r jsonb;
begin
  if coalesce(public.kk_mon_role(), '') not in ('employe','referent','direction') then
    return null;
  end if;
  select * into e from public.enfants where id = p_enfant;
  if not found or not public.kk_acces_creche(e.creche_id) then
    return null;
  end if;
  r := jsonb_build_object(
    'enfant', to_jsonb(e) - 'code_pictos' - 'code_pointage' - 'code' - 'pai_panier_repas',
    'parents', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at)
                         from public.enfants_parents p where p.enfant_id = e.id), '[]'::jsonb),
    'pai', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc)
                     from public.pai x where x.enfant_id = e.id), '[]'::jsonb),
    'pai_pieces', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                            from public.enfants_pai x where x.enfant_id = e.id), '[]'::jsonb),
    'vaccinations', coalesce((select jsonb_agg(to_jsonb(x))
                              from public.vaccinations x where x.enfant_id = e.id), '[]'::jsonb),
    'carnet', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                        from public.vaccins_pj x where x.enfant_id = e.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc)
                           from public.enfants_documents_admin x where x.enfant_id = e.id), '[]'::jsonb)
  );
  return r;
end $$;
revoke all on function public.kk_fiche_enfant_equipe(uuid) from public, anon;
grant execute on function public.kk_fiche_enfant_equipe(uuid) to authenticated;
