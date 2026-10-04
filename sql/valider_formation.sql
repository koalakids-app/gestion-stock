-- ============================================================================
-- Attestation d'une micro-formation, y compris envoyée depuis l'admin du quiz
-- ============================================================================
-- Les envois faits depuis l'écran « Envoyer par mail » de l'admin du quiz
-- n'ont pas de ligne dans formations_envois : il n'y avait donc rien à mettre
-- à jour. Cette fonction attribue l'attestation à l'appelant (son propre
-- compte uniquement) : elle met à jour sa ligne si elle existe, sinon la crée.
-- ============================================================================

create or replace function public.valider_formation(
  p_item_id uuid, p_titre text, p_lien text, p_envoye_le timestamptz default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp uuid;
  v_ref uuid;
  v_n int;
begin
  select id into v_emp from employes where user_id = auth.uid() limit 1;
  if v_emp is null then
    select id into v_ref from referents where user_id = auth.uid() limit 1;
  end if;
  if v_emp is null and v_ref is null then
    raise exception 'Aucune fiche collaborateur liée à ce compte';
  end if;

  update formations_envois set valide_le = now()
   where kind = 'module' and item_id = p_item_id
     and ((v_emp is not null and employe_id = v_emp) or (v_ref is not null and referent_id = v_ref));
  get diagnostics v_n = row_count;

  if v_n = 0 then
    insert into formations_envois(employe_id, referent_id, kind, item_id, item_titre, lien, envoye_le, valide_le)
    values (v_emp, v_ref, 'module', p_item_id, p_titre, p_lien, coalesce(p_envoye_le, now()), now());
  end if;
end;
$$;

revoke all on function public.valider_formation(uuid, text, text, timestamptz) from public;
grant execute on function public.valider_formation(uuid, text, text, timestamptz) to authenticated;
