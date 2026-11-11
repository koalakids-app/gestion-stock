// Edge function "create-referent"
// ============================================================================
// Crée (ou relie) le compte de connexion d'une référente/direction et pose sa
// fiche `referents`. Bascule d'une création directe avec mot de passe choisi
// par la direction vers une invitation Supabase (comme pour les
// collaborateurs/trices, cf. creer-compte-collaborateur) : la personne
// définit elle-même son mot de passe en suivant le lien reçu par e-mail,
// plutôt que de se faire communiquer un mot de passe en clair par un autre
// canal.
//
// Les colonnes must_change_password/temp_password de l'ancienne version
// n'étaient jamais lues côté client (aucun écran ne forçait le changement) —
// elles ne sont plus posées ici.
//
// Appelée depuis demandes.html (saveRef, accorderAccesTerrain) avec le jeton
// de la session. Les droits sont contrôlés ICI (_shared/appelant.ts), pas
// seulement à l'écran : la direction crée tous les profils ; un·e référent·e
// ne crée que l'accès terrain (rôle « employe ») de sa crèche ; la crèche
// visée doit être de l'organisation de l'appelant·e ; un profil existant ne
// se réécrit que dans la même organisation.
//
// Déploiement :
//   supabase functions deploy create-referent
// Secrets nécessaires : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY, injectées
// automatiquement par la plateforme Supabase Edge Functions.
// L'URL passée en `redirect_to` (demandes.html) doit figurer dans la liste
// des "Redirect URLs" autorisées du projet Supabase (Auth > URL
// Configuration) — déjà fait pour collaborateur.html, à vérifier pour
// demandes.html.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { identifierAppelant, peutGererCreche } from "../_shared/appelant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Lien direct vers la page (?token_hash=…&type=…), vérifié au clic par la page
 *  (verifyOtp). L'action_link de Supabase se consomme au premier GET : l'aperçu
 *  de WhatsApp/SMS le « grille » et la personne retombe sur le login. */
function lienDirect(
  props: { hashed_token?: string; verification_type?: string },
  redirectTo?: string,
): string | undefined {
  const vt = props.verification_type;
  if (!props.hashed_token || !redirectTo || (vt !== "invite" && vt !== "recovery")) return undefined;
  const u = new URL(redirectTo);
  u.searchParams.set("token_hash", props.hashed_token);
  u.searchParams.set("type", vt);
  return u.toString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, name, creche_id, poste, role, redirect_to, partager } = await req.json();
    if (!email || !name) {
      return json({ ok: false, error: "Champs requis" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // `referents.org_id` est NOT NULL, mais cette fonction tourne en
    // service_role : elle contourne la RLS et ne connaît donc pas
    // spontanément l'organisation de la personne appelante. On la résout à
    // partir de sa propre fiche referents (même principe que kk_mon_org(),
    // utilisée par les policies RLS, mais en lecture directe via le rôle
    // service pour ne pas dépendre d'un deuxième client anon).
    const appelant = await identifierAppelant(admin, req);
    if (!appelant) {
      return json({ ok: false, error: "Authentification manquante." }, 401);
    }
    const orgId = appelant.orgId;

    // Rôle demandé : liste fermée. Sans cela, n'importe quel compte connecté
    // pouvait se donner (ou donner) le rôle « direction ».
    const roleDemande = role || "referent";
    if (!["direction", "referent", "employe"].includes(roleDemande)) {
      return json({ ok: false, error: "Rôle invalide." }, 400);
    }
    // Direction : crée tous les profils. Référent·e : seulement l'accès terrain
    // (rôle « employe ») de sa propre crèche. Les comptes « employe » : rien.
    if (appelant.role === "direction") {
      // ok
    } else if (appelant.role === "referent") {
      if (roleDemande !== "employe") {
        return json({ ok: false, error: "Réservé aux comptes direction." }, 403);
      }
    } else {
      return json({ ok: false, error: "Droits insuffisants." }, 403);
    }
    // La crèche visée doit appartenir à l'organisation de l'appelant·e (et, pour
    // un·e référent·e, être la sienne). Une crèche vide n'est admise que pour la direction.
    if (creche_id) {
      const { data: crecheCible } = await admin
        .from("creches").select("id, org_id").eq("id", creche_id).maybeSingle();
      if (!peutGererCreche(appelant, crecheCible)) {
        return json({ ok: false, error: "Crèche non autorisée." }, 403);
      }
    } else if (appelant.role !== "direction") {
      return json({ ok: false, error: "Crèche requise." }, 400);
    }

    // Vérifier si l'email existe déjà dans Auth (ex. compte collaborateur/trice
    // ou référent(e) déjà invité(e)) — on ne réinvite pas un compte existant,
    // on se contente de relier sa fiche referents à ce compte.
    // listUsers() est paginé (50 par page par défaut) : on parcourt toutes les pages.
    let existingUser: { id: string; email?: string; last_sign_in_at?: string | null } | undefined;
    for (let page = 1; page <= 50 && !existingUser; page++) {
      const { data: lot } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      const users = lot?.users ?? [];
      existingUser = users.find((u) => (u.email || "").toLowerCase() === String(email).toLowerCase());
      if (users.length < 200) break;
    }

    let userId: string | undefined;
    // partager : pas d'e-mail ; on renvoie le lien d'invitation (ou de
    // définition du mot de passe pour un compte jamais utilisé) que l'appareil
    // de l'appelant·e transmet. Un compte déjà utilisé n'a besoin d'aucun lien.
    let lien: string | undefined;
    const meta = { name, creche_id, poste };

    if (existingUser) {
      userId = existingUser.id;
      if (partager && !existingUser.last_sign_in_at) {
        const { data: rec, error: recErr } = await admin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo: redirect_to || undefined },
        });
        if (recErr) return json({ ok: false, error: recErr.message }, 400);
        lien = lienDirect(rec.properties, redirect_to) ?? rec.properties.action_link;
      }
    } else if (partager) {
      const { data: gen, error: genErr } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo: redirect_to || undefined, data: meta },
      });
      if (genErr) return json({ ok: false, error: genErr.message }, 400);
      userId = gen.user?.id;
      lien = lienDirect(gen.properties, redirect_to) ?? gen.properties.action_link;
    } else {
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
        email,
        { redirectTo: redirect_to || undefined, data: meta },
      );
      if (inviteErr) {
        return json({ ok: false, error: inviteErr.message }, 400);
      }
      userId = invited.user?.id;
    }

    // Vérifier si une ligne referents existe déjà pour ce user_id
    const { data: existingRef } = await admin
      .from("referents").select("id, org_id, role, creche_id").eq("user_id", userId).maybeSingle();
    // Un profil existant ne se réécrit que dans la même organisation, et un·e
    // référent·e ne peut pas modifier un profil de direction ou de référent·e.
    if (existingRef) {
      if (existingRef.org_id !== orgId) {
        return json({ ok: false, error: "Ce compte appartient à une autre organisation." }, 403);
      }
      if (appelant.role !== "direction" && existingRef.role !== "employe") {
        return json({ ok: false, error: "Ce compte a déjà un profil : réservé à la direction." }, 403);
      }
    }

    const row = {
      name, email,
      poste: poste || "",
      creche_id: creche_id || null,
      role: roleDemande,
      org_id: orgId,
    };

    if (existingRef) {
      const { error: updErr } = await admin.from("referents").update(row).eq("user_id", userId);
      if (updErr) return json({ ok: false, error: updErr.message }, 400);
    } else {
      const { error: dbError } = await admin.from("referents").insert({ ...row, user_id: userId });
      if (dbError) return json({ ok: false, error: dbError.message }, 400);
    }

    return json({ ok: true, user_id: userId, lien });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});
