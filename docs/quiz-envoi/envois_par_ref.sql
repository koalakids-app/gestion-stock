-- À exécuter dans le projet QUIZ (phbcqxjzobzwuzetgbem), en une seule fois.
-- « Mon parcours de formation » (collaborateur.html, projet gestion-stock) lit
-- ici les envois faits depuis l'admin du quiz, par le `ref` de la fiche : même
-- principe que kk_resultats_par_ref (pas d'accès direct à la table, un
-- identifiant opaque pour clé). Ne renvoie que le type, l'identifiant, le
-- titre et la date : ni mail, ni nom, ni crèche.
create or replace function public.kk_envois_par_ref(p_ref text)
returns table (kind text, item_id uuid, item_titre text, envoye_le timestamptz)
language sql stable security definer set search_path = public as $$
  select e.kind, e.item_id, e.item_titre, e.envoye_le
  from public.envois_quiz e
  where e.ref = p_ref and e.etat = 'envoye'
  order by e.envoye_le desc;
$$;
revoke all on function public.kk_envois_par_ref(text) from public;
grant execute on function public.kk_envois_par_ref(text) to anon, authenticated, service_role;

-- Contrôle : doit renvoyer 1 ligne
select proname from pg_proc where proname = 'kk_envois_par_ref';
