-- Intitulé des documents du pack (piece_key papier_<id> / enligne_<id>) pour les fiches enfants de l'Accès terrain.
-- À appliquer à la main (redéfinit kk_fiche_enfant_equipe ; sans lui, le JS retombe sur « Document rempli par la famille »).
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
                           from public.enfants_documents_admin x where x.enfant_id = e.id), '[]'::jsonb),
    'titres_documents', coalesce((select jsonb_object_agg(k.id::text, k.titre)
                                  from public.documents_koala k
                                  where exists (select 1 from public.enfants_documents_admin x
                                                where x.enfant_id = e.id
                                                  and x.piece_key in ('papier_' || k.id::text, 'enligne_' || k.id::text))),
                                 '{}'::jsonb)
  );
  return r;
end $$;

revoke all on function public.kk_fiche_enfant_equipe(uuid) from public, anon;
grant execute on function public.kk_fiche_enfant_equipe(uuid) to authenticated;
