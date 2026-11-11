-- ============================================================================
-- Sécurité — audit, priorité 2 (à appliquer à la main sur le projet juyrceadazrovlitxceb)
-- ============================================================================
-- 1. Les comptes « employe » (accès terrain) ne lisent plus les autres fiches
--    `referents` : leurs codes de pointage / code image ouvraient une session à
--    leur place sur l'Accès terrain.
-- 2. Retrait de l'ancien pointage par code à 4 chiffres (kk_kiosk_pointer,
--    kk_kiosk_annuler_dernier), plus appelé par l'application et sans contrôle d'appareil.
-- 3. Les fonctions des tablettes de suivi / couches vérifient l'appareil lié
--    (kiosk_devices.appareil_id, comme le pointage). Un jeton lié n'est accepté que de
--    son appareil ; un jeton non lié reste ouvert (comme avant) jusqu'à la première liaison,
--    faite par suivi.html (kk_kiosk_lier). Les anciennes signatures (sans p_appareil) sont
--    conservées et, en PHASE 1, acceptées comme avant ; la PHASE 2
--    (securite_priorite2_kiosques_phase2.sql) les limite aux jetons non liés.
-- 4. Écriture dans le bucket `assets` limitée aux comptes ayant une fiche referents.
-- Retour arrière : voir la fin du fichier.
-- ============================================================================

-- ---------- 1. referents : lecture ----------
drop policy if exists referents_select on public.referents;
create policy referents_select on public.referents
  for select to authenticated
  using (
    org_id = public.kk_mon_org()
    and (user_id = auth.uid() or public.kk_mon_role() in ('referent','direction'))
  );

-- ---------- 2. Ancien pointage par code à 4 chiffres ----------
revoke all on function public.kk_kiosk_pointer(uuid, text) from public, anon, authenticated;
revoke all on function public.kk_kiosk_annuler_dernier(uuid, text) from public, anon, authenticated;

-- ---------- 3. Tablettes de suivi / couches : contrôle de l'appareil ----------
create or replace function public.kk_kiosk_appareil_ok(p_token uuid, p_appareil text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.kiosk_devices d
    where d.token = p_token and d.active = true
      and (d.appareil_id is null or d.appareil_id = p_appareil)
  );
$$;
revoke all on function public.kk_kiosk_appareil_ok(uuid, text) from public;
grant execute on function public.kk_kiosk_appareil_ok(uuid, text) to anon, authenticated, service_role;

-- Bascule des anciennes signatures (sans p_appareil), utilisées par les pages suivi.html
-- encore ouvertes avec l'ancien code. PHASE 1 : tout est accepté (comportement inchangé).
-- PHASE 2 (après mise en ligne du nouveau suivi.html et rechargement des tablettes) :
-- voir sql/securite_priorite2_kiosques_phase2.sql.
create or replace function public.kk_kiosk_ancienne_signature_ok(p_token uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$ select true $$;
revoke all on function public.kk_kiosk_ancienne_signature_ok(uuid) from public, anon, authenticated;

-- kk_couches_kiosk_enfants
alter function public.kk_couches_kiosk_enfants(p_token uuid) rename to kk_couches_kiosk_enfants_interne;
revoke all on function public.kk_couches_kiosk_enfants_interne(uuid) from public, anon, authenticated;

create or replace function public.kk_couches_kiosk_enfants(p_token uuid)
returns TABLE(id uuid, prenom text, nom text, taille_couche text, type_couche text, nb integer)
language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.kk_kiosk_ancienne_signature_ok(p_token) then
    return;
  end if;
  return query select * from public.kk_couches_kiosk_enfants_interne(p_token);
end;
$f$;

create or replace function public.kk_couches_kiosk_enfants(p_token uuid, p_appareil text)
returns TABLE(id uuid, prenom text, nom text, taille_couche text, type_couche text, nb integer)
language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.kk_kiosk_appareil_ok(p_token, p_appareil) then
    return;
  end if;
  return query select * from public.kk_couches_kiosk_enfants_interne(p_token);
end;
$f$;

-- kk_couches_kiosk_saisir
alter function public.kk_couches_kiosk_saisir(p_token uuid, p_auteur_type text, p_auteur_id uuid, p_enfant_id uuid, p_nb integer) rename to kk_couches_kiosk_saisir_interne;
revoke all on function public.kk_couches_kiosk_saisir_interne(uuid, text, uuid, uuid, integer) from public, anon, authenticated;

create or replace function public.kk_couches_kiosk_saisir(p_token uuid, p_auteur_type text, p_auteur_id uuid, p_enfant_id uuid, p_nb integer)
returns TABLE(ok boolean, error text, nb integer)
language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.kk_kiosk_ancienne_signature_ok(p_token) then
    return query select false, 'autre_appareil'::text, 0;
    return;
  end if;
  return query select * from public.kk_couches_kiosk_saisir_interne(p_token, p_auteur_type, p_auteur_id, p_enfant_id, p_nb);
end;
$f$;

create or replace function public.kk_couches_kiosk_saisir(p_token uuid, p_appareil text, p_auteur_type text, p_auteur_id uuid, p_enfant_id uuid, p_nb integer)
returns TABLE(ok boolean, error text, nb integer)
language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.kk_kiosk_appareil_ok(p_token, p_appareil) then
    return query select false, 'autre_appareil'::text, 0;
    return;
  end if;
  return query select * from public.kk_couches_kiosk_saisir_interne(p_token, p_auteur_type, p_auteur_id, p_enfant_id, p_nb);
end;
$f$;

-- kk_suivi_kiosk_annuler
alter function public.kk_suivi_kiosk_annuler(p_token uuid, p_auteur_type text, p_auteur_id uuid, p_id uuid, p_table text) rename to kk_suivi_kiosk_annuler_interne;
revoke all on function public.kk_suivi_kiosk_annuler_interne(uuid, text, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.kk_suivi_kiosk_annuler(p_token uuid, p_auteur_type text, p_auteur_id uuid, p_id uuid, p_table text)
returns boolean
language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.kk_kiosk_ancienne_signature_ok(p_token) then return false; end if;
  return public.kk_suivi_kiosk_annuler_interne(p_token, p_auteur_type, p_auteur_id, p_id, p_table);
end;
$f$;

create or replace function public.kk_suivi_kiosk_annuler(p_token uuid, p_appareil text, p_auteur_type text, p_auteur_id uuid, p_id uuid, p_table text)
returns boolean
language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.kk_kiosk_appareil_ok(p_token, p_appareil) then return false; end if;
  return public.kk_suivi_kiosk_annuler_interne(p_token, p_auteur_type, p_auteur_id, p_id, p_table);
end;
$f$;

-- kk_suivi_kiosk_enfants_presents
alter function public.kk_suivi_kiosk_enfants_presents(p_token uuid) rename to kk_suivi_kiosk_enfants_presents_interne;
revoke all on function public.kk_suivi_kiosk_enfants_presents_interne(uuid) from public, anon, authenticated;

create or replace function public.kk_suivi_kiosk_enfants_presents(p_token uuid)
returns TABLE(id uuid, prenom text, nom text, dob date, allergies text, regime_repas text, repas_base text, gouter_base text, groupe text, pai_actif boolean)
language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.kk_kiosk_ancienne_signature_ok(p_token) then
    return;
  end if;
  return query select * from public.kk_suivi_kiosk_enfants_presents_interne(p_token);
end;
$f$;

create or replace function public.kk_suivi_kiosk_enfants_presents(p_token uuid, p_appareil text)
returns TABLE(id uuid, prenom text, nom text, dob date, allergies text, regime_repas text, repas_base text, gouter_base text, groupe text, pai_actif boolean)
language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.kk_kiosk_appareil_ok(p_token, p_appareil) then
    return;
  end if;
  return query select * from public.kk_suivi_kiosk_enfants_presents_interne(p_token);
end;
$f$;

-- kk_suivi_kiosk_identifier
alter function public.kk_suivi_kiosk_identifier(p_token uuid, p_code_pictos text[]) rename to kk_suivi_kiosk_identifier_interne;
revoke all on function public.kk_suivi_kiosk_identifier_interne(uuid, text[]) from public, anon, authenticated;

create or replace function public.kk_suivi_kiosk_identifier(p_token uuid, p_code_pictos text[])
returns TABLE(ok boolean, error text, label text, sub text)
language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.kk_kiosk_ancienne_signature_ok(p_token) then
    return query select false, 'autre_appareil'::text, null::text, null::text;
    return;
  end if;
  return query select * from public.kk_suivi_kiosk_identifier_interne(p_token, p_code_pictos);
end;
$f$;

create or replace function public.kk_suivi_kiosk_identifier(p_token uuid, p_appareil text, p_code_pictos text[])
returns TABLE(ok boolean, error text, label text, sub text)
language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.kk_kiosk_appareil_ok(p_token, p_appareil) then
    return query select false, 'autre_appareil'::text, null::text, null::text;
    return;
  end if;
  return query select * from public.kk_suivi_kiosk_identifier_interne(p_token, p_code_pictos);
end;
$f$;

-- kk_suivi_kiosk_observer
alter function public.kk_suivi_kiosk_observer(p_token uuid, p_auteur_type text, p_auteur_id uuid, p_enfant_id uuid, p_jalon_id uuid, p_statut text, p_note text, p_posture text, p_partage text) rename to kk_suivi_kiosk_observer_interne;
revoke all on function public.kk_suivi_kiosk_observer_interne(uuid, text, uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.kk_suivi_kiosk_observer(p_token uuid, p_auteur_type text, p_auteur_id uuid, p_enfant_id uuid, p_jalon_id uuid, p_statut text, p_note text, p_posture text, p_partage text)
returns TABLE(ok boolean, error text, observation_id uuid)
language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.kk_kiosk_ancienne_signature_ok(p_token) then
    return query select false, 'autre_appareil'::text, null::uuid;
    return;
  end if;
  return query select * from public.kk_suivi_kiosk_observer_interne(p_token, p_auteur_type, p_auteur_id, p_enfant_id, p_jalon_id, p_statut, p_note, p_posture, p_partage);
end;
$f$;

create or replace function public.kk_suivi_kiosk_observer(p_token uuid, p_appareil text, p_auteur_type text, p_auteur_id uuid, p_enfant_id uuid, p_jalon_id uuid, p_statut text, p_note text, p_posture text, p_partage text)
returns TABLE(ok boolean, error text, observation_id uuid)
language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.kk_kiosk_appareil_ok(p_token, p_appareil) then
    return query select false, 'autre_appareil'::text, null::uuid;
    return;
  end if;
  return query select * from public.kk_suivi_kiosk_observer_interne(p_token, p_auteur_type, p_auteur_id, p_enfant_id, p_jalon_id, p_statut, p_note, p_posture, p_partage);
end;
$f$;

-- kk_suivi_kiosk_personnel_present
alter function public.kk_suivi_kiosk_personnel_present(p_token uuid) rename to kk_suivi_kiosk_personnel_present_interne;
revoke all on function public.kk_suivi_kiosk_personnel_present_interne(uuid) from public, anon, authenticated;

create or replace function public.kk_suivi_kiosk_personnel_present(p_token uuid)
returns TABLE(id uuid, type text, label text, sub text)
language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.kk_kiosk_ancienne_signature_ok(p_token) then
    return;
  end if;
  return query select * from public.kk_suivi_kiosk_personnel_present_interne(p_token);
end;
$f$;

create or replace function public.kk_suivi_kiosk_personnel_present(p_token uuid, p_appareil text)
returns TABLE(id uuid, type text, label text, sub text)
language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.kk_kiosk_appareil_ok(p_token, p_appareil) then
    return;
  end if;
  return query select * from public.kk_suivi_kiosk_personnel_present_interne(p_token);
end;
$f$;

-- kk_suivi_kiosk_saisir
alter function public.kk_suivi_kiosk_saisir(p_token uuid, p_auteur_type text, p_auteur_id uuid, p_enfant_ids uuid[], p_type text, p_valeur jsonb) rename to kk_suivi_kiosk_saisir_interne;
revoke all on function public.kk_suivi_kiosk_saisir_interne(uuid, text, uuid, uuid[], text, jsonb) from public, anon, authenticated;

create or replace function public.kk_suivi_kiosk_saisir(p_token uuid, p_auteur_type text, p_auteur_id uuid, p_enfant_ids uuid[], p_type text, p_valeur jsonb)
returns TABLE(enfant_id uuid, ok boolean, error text, saisie_id uuid)
language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.kk_kiosk_ancienne_signature_ok(p_token) then
    return query select null::uuid, false, 'autre_appareil'::text, null::uuid;
    return;
  end if;
  return query select * from public.kk_suivi_kiosk_saisir_interne(p_token, p_auteur_type, p_auteur_id, p_enfant_ids, p_type, p_valeur);
end;
$f$;

create or replace function public.kk_suivi_kiosk_saisir(p_token uuid, p_appareil text, p_auteur_type text, p_auteur_id uuid, p_enfant_ids uuid[], p_type text, p_valeur jsonb)
returns TABLE(enfant_id uuid, ok boolean, error text, saisie_id uuid)
language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.kk_kiosk_appareil_ok(p_token, p_appareil) then
    return query select null::uuid, false, 'autre_appareil'::text, null::uuid;
    return;
  end if;
  return query select * from public.kk_suivi_kiosk_saisir_interne(p_token, p_auteur_type, p_auteur_id, p_enfant_ids, p_type, p_valeur);
end;
$f$;

-- ---------- 4. Bucket public `assets` : écriture réservée aux comptes de l'application ----------
-- Avant : tout compte connecté (y compris un compte « Mon espace » sans fiche referents) pouvait
-- ajouter, remplacer ou supprimer n'importe quel fichier. Maintenant : une fiche referents
-- (direction, référent ou accès terrain) est requise. Le dossier documents/ reste réservé à la
-- direction (politiques RESTRICTIVE assets_documents_*_direction, inchangées).
-- La lecture reste publique par adresse exacte (bucket public) : voir la note de l'audit sur
-- les pièces sensibles (messagerie/, frais-pro-photos/, salaries-pj/, vaccins-pj/).
drop policy if exists "Authenticated users can update assets" on storage.objects;
drop policy if exists "Authenticated users can upload to assets" on storage.objects;
drop policy if exists assets_auth_delete on storage.objects;
drop policy if exists assets_docs_insert on storage.objects;
drop policy if exists assets_docs_update on storage.objects;
create policy assets_ecriture_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'assets' and public.kk_mon_role() is not null);
create policy assets_ecriture_update on storage.objects for update to authenticated
  using (bucket_id = 'assets' and public.kk_mon_role() is not null)
  with check (bucket_id = 'assets' and public.kk_mon_role() is not null);
create policy assets_ecriture_delete on storage.objects for delete to authenticated
  using (bucket_id = 'assets' and public.kk_mon_role() is not null);

-- ---------- Retour arrière ----------
-- Pour chaque fonction X ci-dessus :
--   drop function public.X(<nouvelle signature avec p_appareil>);
--   drop function public.X(<ancienne signature>);   -- le wrapper
--   alter function public.X_interne(<ancienne signature>) rename to X;
--   grant execute on function public.X(<ancienne signature>) to anon, authenticated;
-- Ancien pointage :
--   grant execute on function public.kk_kiosk_pointer(uuid, text) to anon, authenticated;
--   grant execute on function public.kk_kiosk_annuler_dernier(uuid, text) to anon, authenticated;
-- referents : recréer referents_select avec  using (org_id = public.kk_mon_org()).
-- assets : supprimer assets_ecriture_* et recréer les politiques « authenticated » sur bucket_id = 'assets'
--   (insert « Authenticated users can upload to assets », update « Authenticated users can update assets »,
--   delete assets_auth_delete).
