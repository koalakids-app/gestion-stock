-- ============================================================================
-- Facturation : contrôle d'accès dans les fonctions SECURITY DEFINER
--
-- Problème : attribuer_numero_facture(p_facture) et recalc_facture(p_facture)
-- s'exécutent avec les droits du propriétaire (donc hors RLS) et ne vérifiaient
-- ni le rôle ni la crèche de l'appelant. Tout compte connecté, même d'une autre
-- organisation ou sans rôle direction, pouvait numéroter ou recalculer n'importe
-- quelle facture dont il connaissait l'UUID.
--
-- Correctif : les deux fonctions appliquent la règle des politiques RLS de
-- `factures` : direction ET crèche de sa propre organisation. Le recalcul
-- appelé par les triggers (lignes, règlements) passe par une fonction interne
-- sans contrôle, non exposée : la RLS des tables protège déjà ces écritures, et
-- les modifications faites depuis le SQL Editor continuent de fonctionner.
--
-- Contrôle ajouté : kk_peut_gerer_facture(creche). Il laisse passer le rôle
-- service_role (fonctions Edge) et refuse tout le reste.
-- Les appels depuis le SQL Editor ne passent plus par attribuer_numero_facture
-- (pas de compte connecté) : numéroter une facture se fait depuis l'app.
-- ============================================================================

-- 1. Le contrôle, non exposé à l'API (appelé uniquement par les fonctions ci-dessous)
create or replace function public.kk_peut_gerer_facture(p_creche uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or (
        public.kk_est_direction()
        and exists (
          select 1 from public.creches c
          where c.id = p_creche and c.org_id = public.kk_mon_org()
        )
      );
$$;

revoke all on function public.kk_peut_gerer_facture(uuid) from public, anon, authenticated;

-- 2. Recalcul interne : ancien corps de recalc_facture, sans contrôle, non exposé
create or replace function public.kk_recalc_facture_interne(p_facture uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total  numeric(10,2);
  v_regle  numeric(10,2);
  v_statut text;
begin
  select coalesce(sum(montant),0) into v_total
    from public.factures_lignes where facture_id = p_facture;
  select coalesce(sum(montant),0) into v_regle
    from public.factures_reglements where facture_id = p_facture;
  select statut into v_statut from public.factures where id = p_facture;
  if v_statut is null then return; end if;

  update public.factures
     set total       = v_total,
         total_regle = v_regle,
         solde       = round(v_total - v_regle, 2),
         statut = case
           when statut in ('brouillon','annulee') then statut
           when v_regle >= v_total and v_total <> 0 then 'payee'
           when v_regle > 0 then 'partielle'
           when envoye_le is not null then 'envoyee'
           else 'emise' end,
         updated_at = now()
   where id = p_facture;
end;
$$;

revoke all on function public.kk_recalc_facture_interne(uuid) from public, anon, authenticated;

-- 3. Le trigger appelle la version interne
create or replace function public.trg_recalc_facture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.kk_recalc_facture_interne(coalesce(new.facture_id, old.facture_id));
  return null;
end;
$$;

-- 4. recalc_facture (RPC) : contrôle puis recalcul
create or replace function public.recalc_facture(p_facture uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creche uuid;
begin
  select creche_id into v_creche from public.factures where id = p_facture;
  if v_creche is null or not public.kk_peut_gerer_facture(v_creche) then
    raise exception 'Facture introuvable.';
  end if;
  perform public.kk_recalc_facture_interne(p_facture);
end;
$$;

-- 5. attribuer_numero_facture : même corps qu'avant + contrôle d'accès
create or replace function public.attribuer_numero_facture(p_facture uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  f          public.factures%rowtype;
  v_cle      text;
  v_annee    int;
  v_prefixe  text;
  v_num      int;
  v_numero   text;
begin
  select * into f from public.factures where id = p_facture for update;
  -- Même message si la facture n'existe pas ou n'est pas accessible : on ne
  -- révèle pas l'existence d'une facture d'une autre organisation.
  if not found or not public.kk_peut_gerer_facture(f.creche_id) then
    raise exception 'Facture introuvable.';
  end if;

  -- Idempotent : un double clic ne consomme pas deux numéros.
  if f.numero is not null then
    return f.numero;
  end if;
  if f.statut = 'annulee' then
    raise exception 'Une facture annulée ne se numérote pas.';
  end if;
  if not exists (select 1 from public.factures_lignes where facture_id = p_facture) then
    raise exception 'Facture sans aucune ligne : il n''y a rien à émettre.';
  end if;

  v_cle   := public.societe_cle_de(f.creche_id);
  v_annee := extract(year from coalesce(f.date_emission, current_date))::int;

  if v_cle like 'creche:%' then
    raise exception 'Cette crèche n''a pas de SIRET renseigné : une facture sans SIRET de l''émetteur est irrégulière. Compléter l''identité juridique dans Paramètres.';
  end if;

  -- Le préfixe par défaut : les lettres de la raison sociale, à défaut « F ».
  select coalesce(nullif(upper(regexp_replace(coalesce(e.raison_sociale,''),'[^A-Za-z]','','g')),''), 'F')
    into v_prefixe
  from public.etablissements e where e.creche_id = f.creche_id;
  v_prefixe := left(coalesce(v_prefixe,'F'), 12);

  insert into public.factures_series (societe_cle, annee, prefixe, dernier_numero, libelle)
  values (v_cle, v_annee, v_prefixe, 0,
          (select raison_sociale from public.etablissements where creche_id = f.creche_id))
  on conflict (societe_cle, annee) do nothing;

  update public.factures_series
     set dernier_numero = dernier_numero + 1,
         updated_at = now()
   where societe_cle = v_cle and annee = v_annee
  returning dernier_numero, prefixe into v_num, v_prefixe;

  v_numero := v_prefixe || '-' || v_annee::text || '-' || lpad(v_num::text, 4, '0');

  update public.factures
     set numero        = v_numero,
         serie         = v_prefixe || '-' || v_annee::text,
         date_emission = coalesce(date_emission, current_date),
         statut        = case when statut = 'brouillon' then 'emise' else statut end,
         updated_at    = now()
   where id = p_facture;

  return v_numero;
end;
$$;

-- 6. Droits : appelables par les comptes connectés uniquement (le contrôle
--    ci-dessus restreint ensuite à la direction de la bonne organisation).
revoke all on function public.attribuer_numero_facture(uuid) from public, anon;
grant execute on function public.attribuer_numero_facture(uuid) to authenticated;
revoke all on function public.recalc_facture(uuid) from public, anon;
grant execute on function public.recalc_facture(uuid) to authenticated;
