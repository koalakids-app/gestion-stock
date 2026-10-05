-- À exécuter dans le projet QUIZ (phbcqxjzobzwuzetgbem), SQL Editor, en une seule fois.
--
-- Crée dans le projet Quiz les comptes des directeurs / référents / direction
-- qui se connectent au portail gestion-stock, pour qu'ils puissent ouvrir
-- « Quiz & Formations » (admin.html). Les e-mails sont ceux de connexion du
-- portail (table referents), pas les e-mails personnels de la table employes.
--
-- Idempotent : un e-mail déjà présent dans auth.users est ignoré (son mot de
-- passe n'est PAS modifié). Peut être relancé sans risque.
--
-- AVANT D'EXÉCUTER : remplacer le mot de passe provisoire ci-dessous
-- (8 caractères minimum). Il sera communiqué aux intéressés, qui pourront le
-- changer ensuite (Dashboard > Authentication > Users > Send password recovery).

do $$
declare
  v_pwd text := 'CHANGER_MOI';   -- <<< mot de passe provisoire à définir
  r record;
  v_id uuid;
begin
  if v_pwd = 'CHANGER_MOI' or length(v_pwd) < 8 then
    raise exception 'Définir un mot de passe provisoire (8 caractères min) dans v_pwd avant exécution.';
  end if;

  for r in
    select * from (values
      ('François Lelong',    'rt.toulon.picot1@outlook.fr'),
      ('Sarah Santamaria',   'rt.toulon.picot2@outlook.com'),
      ('Laureline Bergeron', 'rt.toulon.ollioules@outlook.fr'),
      ('Manon Szymczak',     'rt.toulon.brunet@outlook.fr'),
      ('Alice Bujalski',     'rt.toulon.saintjean@outlook.fr'),
      ('Nathalie Joubert',   'nathavagcom@gmail.com'),
      ('David Bucari',       'cp1.koalakids@outlook.fr'),
      ('Andy Janin',         'a.janin@koalakids.fr'),
      ('Cyril Gabriel',      'c.gabriel@koalakids.fr')
    ) as t(nom, email)
  loop
    if exists (select 1 from auth.users where lower(email) = lower(r.email)) then
      raise notice 'Déjà présent, ignoré : %', r.email;
      continue;
    end if;

    v_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      lower(r.email), extensions.crypt(v_pwd, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', r.nom),
      now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_id, v_id::text, 'email',
      jsonb_build_object('sub', v_id::text, 'email', lower(r.email), 'email_verified', true),
      now(), now(), now()
    );

    raise notice 'Créé : % (%)', r.nom, r.email;
  end loop;
end $$;

-- Vérification : les 9 comptes doivent apparaître.
select email, email_confirmed_at is not null as confirme, created_at
from auth.users
where lower(email) in (
  'rt.toulon.picot1@outlook.fr','rt.toulon.picot2@outlook.com',
  'rt.toulon.ollioules@outlook.fr','rt.toulon.brunet@outlook.fr',
  'rt.toulon.saintjean@outlook.fr','nathavagcom@gmail.com',
  'cp1.koalakids@outlook.fr','a.janin@koalakids.fr','c.gabriel@koalakids.fr'
)
order by email;
