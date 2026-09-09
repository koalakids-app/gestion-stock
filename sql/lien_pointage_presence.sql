-- ============================================================================
-- Lien pointage → présences (enfants)
-- ============================================================================
-- Au pointage d'une ARRIVÉE d'enfant (tablette par code OU kiosque connecté),
-- on marque automatiquement l'enfant présent (matin + après-midi, comme le
-- fait déjà togglePresence() côté app — cette micro-crèche ne distingue pas
-- les deux créneaux) dans `presences`, pour cette date.
--
-- Volontairement SANS renseigner presences.heure_debut/heure_fin : ces colonnes
-- servent, dans le Gantt du module Présences (renderPresenceGantt), à afficher
-- l'horaire réel quand il est connu (import planning PDF) — sinon la barre
-- retombe sur les horaires du contrat d'accueil qui couvre ce jour
-- (`enfants_contrats.heure_debut/heure_fin`, cf. la variable `ct` dans
-- renderPresenceGantt). Comme demandé : le temps d'accueil affiché doit suivre
-- le contrat, pas l'heure de pointage — donc on ne touche pas à ces colonnes.
--
-- Le Gantt affiche déjà un repère « ○ » quand aucun contrat ne couvre ce jour
-- de la semaine (variable `horsJour`) : rien à ajouter côté SQL pour ça, il
-- suffit que la ligne de présence existe.
--
-- Ne fait rien au DÉPART (un enfant reste « présent » pour la journée après
-- son départ — non demandé, non touché) ni pour les référent(e)s/employé(e)s
-- (`presences` ne porte que des enfants).
-- ============================================================================

create or replace function public.kk_kiosk_pointer(p_token uuid, p_code text)
returns table(
  ok boolean,
  error text,
  type text,
  label text,
  sub text,
  action text,
  horodatage timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device        public.kiosk_devices;
  v_recent_fail   int;
  v_enfant        public.enfants;
  v_referent      public.referents;
  v_employe       public.employes;
  v_creche_id     uuid;
  v_id            uuid;
  v_type          text;
  v_label         text;
  v_sub           text;
  v_last_action   text;
  v_new_action    text;
  v_horodatage    timestamptz;
  v_matches       int;
begin
  select * into v_device from public.kiosk_devices
    where token = p_token and active = true;

  if v_device is null then
    return query select false, 'token_invalide', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select count(*) into v_recent_fail
    from public.kiosk_login_attempts
    where device_id = v_device.id
      and success = false
      and attempted_at > now() - interval '5 minutes';

  if v_recent_fail >= 15 then
    return query select false, 'trop_de_tentatives', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  v_creche_id := v_device.creche_id;

  if p_code is null or p_code !~ '^[0-9]{4}$' then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_invalide', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select * into v_enfant from public.enfants
    where creche_id = v_creche_id and code_pointage = p_code
      and (date_sortie is null or date_sortie >= current_date)
    limit 1;

  select * into v_referent from public.referents
    where creche_id = v_creche_id and code_pointage = p_code
    limit 1;

  select * into v_employe from public.employes
    where creche_id = v_creche_id and code_pointage = p_code
    limit 1;

  v_matches := (case when v_enfant.id is not null then 1 else 0 end)
             + (case when v_referent.id is not null then 1 else 0 end)
             + (case when v_employe.id is not null then 1 else 0 end);

  if v_matches > 1 then
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_ambigu', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  elsif v_enfant.id is not null then
    v_type := 'enfant';
    v_id := v_enfant.id;
    v_label := v_enfant.prenom;
    v_sub := v_enfant.nom;
  elsif v_referent.id is not null then
    v_type := 'salarie';
    v_id := v_referent.id;
    v_label := v_referent.name;
    v_sub := coalesce(v_referent.poste, case when v_referent.role = 'direction' then 'Direction' else 'Référente' end);
  elsif v_employe.id is not null then
    v_type := 'employe';
    v_id := v_employe.id;
    v_label := v_employe.prenom;
    v_sub := coalesce(v_employe.poste, 'Employé(e)');
  else
    insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, false);
    return query select false, 'code_inconnu', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select p.action into v_last_action
    from public.pointages p
    where p.creche_id = v_creche_id
      and ((v_type = 'enfant' and p.enfant_id = v_id)
        or (v_type = 'salarie' and p.salarie_id = v_id)
        or (v_type = 'employe' and p.employe_id = v_id))
      and p.horodatage::date = current_date
    order by p.horodatage desc
    limit 1;

  v_new_action := case when v_last_action = 'arrivee' then 'depart' else 'arrivee' end;

  if v_type = 'enfant' then
    insert into public.pointages as pt (creche_id, enfant_id, action, effectue_par, source)
      values (v_creche_id, v_id, v_new_action, null, 'kiosque_code')
      returning pt.horodatage into v_horodatage;
    if v_new_action = 'arrivee' then
      insert into public.presences (enfant_id, presence_date, slot, status)
        values (v_id, current_date, 'M', 'present')
        on conflict (enfant_id, presence_date, slot) do nothing;
      insert into public.presences (enfant_id, presence_date, slot, status)
        values (v_id, current_date, 'A', 'present')
        on conflict (enfant_id, presence_date, slot) do nothing;
    end if;
  elsif v_type = 'salarie' then
    insert into public.pointages as pt (creche_id, salarie_id, action, effectue_par, source)
      values (v_creche_id, v_id, v_new_action, null, 'kiosque_code')
      returning pt.horodatage into v_horodatage;
  else
    insert into public.pointages as pt (creche_id, employe_id, action, effectue_par, source)
      values (v_creche_id, v_id, v_new_action, null, 'kiosque_code')
      returning pt.horodatage into v_horodatage;
  end if;

  insert into public.kiosk_login_attempts(device_id, success) values (v_device.id, true);

  return query select true, null::text, v_type, v_label, v_sub, v_new_action, v_horodatage;
end;
$$;
