// Edge function "envoyer-code-pictos-employe"
// ============================================================================
// Envoie par e-mail (SMTP Gmail) le code image (4 pictogrammes) d'un employé
// (table `employes`, personnel sans compte de connexion) à sa propre
// adresse — pendant de envoyer-code-pictos-referent, mais pour les employés
// (cf. sql/kiosque_code_pictos_employes.sql).
//
// Le code numérique (employes.code_pointage) reste en base pour la période
// de transition, mais n'est plus proposé par l'interface une fois le code
// image généré ; employes.code_pictos est ce qui est réellement comparé par
// kk_kiosk_pointer_pictos(token, code_pictos[]) sur la tablette.
//
// Appelée depuis demandes.html (kkSendPictos → callFn) avec l'anon key : le
// filtrage par droits est déjà fait côté client (module visible aux comptes
// direction/référente seulement), et cette fonction ne lit que l'employé
// demandé, via son id.
//
// Déploiement :
//   supabase functions deploy envoyer-code-pictos-employe
// Secrets nécessaires (mêmes noms que les autres fonctions d'envoi d'e-mail
// de l'appli) :
//   GMAIL_USER           adresse Gmail d'expédition (ex. koalakids.app@gmail.com)
//   GMAIL_APP_PASSWORD   mot de passe d'application à 16 caractères, généré
//                        depuis myaccount.google.com/apppasswords
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement par
// la plateforme Supabase Edge Functions.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sendEmail(to: string[], subject: string, html: string) {
  const user = Deno.env.get("GMAIL_USER");
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) {
    throw new Error("Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).");
  }
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: user, password: pass },
    },
  });
  try {
    await client.send({
      from: user,
      to,
      subject,
      content: "Ce message nécessite un client de messagerie compatible HTML.",
      html,
    });
  } finally {
    await client.close();
  }
}

// Même bucket public "assets" que côté kiosque/enfants/référents — les noms
// d'image doivent rester synchronisés avec ceux utilisés dans tablette.html.
const KK_PICTOS: Record<string, string> = {
  ours: "https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/ours.png",
  arc_en_ciel: "https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/arc_en_ciel.png",
  zebre: "https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/zebre.png",
  hochet: "https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/hochet.png",
  baleine: "https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/baleine.png",
  cubes_alphabet: "https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/cubes_alphabet.png",
  camionnette_rouge: "https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/camionnette_rouge.png",
  pingouin: "https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/pingouin.png",
};

function pictosEmailHtml(opts: { nom: string; creche: string; pictos: string[] }) {
  const images = opts.pictos.map((id) =>
    `<img src="${KK_PICTOS[id] || ""}" alt="${id}" width="70" height="70"
       style="width:70px;height:70px;border-radius:12px;object-fit:cover;margin:0 6px">`
  ).join("");
  return `
    <div style="font-family:'Nunito',Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#4A3F9F;margin:0 0 4px">Votre code de pointage</h2>
      <p style="color:#8E8AA8;margin:0 0 20px">À utiliser sur la tablette de pointage — ${opts.creche}</p>
      <div style="background:#F1EFF7;border-radius:16px;padding:20px;text-align:center;margin-bottom:18px">
        <div style="font-size:13px;color:#8E8AA8;margin-bottom:10px">Code de pointage</div>
        <div>${images}</div>
      </div>
      <p style="color:#2B2740;font-size:14px;line-height:1.6">
        Sur l'écran d'accueil de la tablette (mode kiosque), touchez ces 4 images, dans cet ordre,
        pour pointer votre arrivée et votre départ. Ce code est personnel :
        merci de ne pas le communiquer.
      </p>
    </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { employe_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps_invalide" }, 400);
  }
  const { employe_id } = body;
  if (!employe_id) return json({ error: "employe_id_manquant" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: employe, error: eErr } = await supabase
      .from("employes")
      .select("id, prenom, nom, email, code_pictos, creche_id")
      .eq("id", employe_id)
      .maybeSingle();
    if (eErr) throw eErr;
    if (!employe) return json({ error: "employe_introuvable" }, 404);
    if (!Array.isArray(employe.code_pictos) || employe.code_pictos.length !== 4) {
      return json({ error: "code_absent" }, 400);
    }
    if (!employe.email) return json({ error: "aucun_email" }, 400);

    const { data: creche } = await supabase
      .from("creches").select("name").eq("id", employe.creche_id).maybeSingle();

    await sendEmail(
      [employe.email],
      "Votre code de pointage",
      pictosEmailHtml({
        nom: [employe.prenom, employe.nom].filter(Boolean).join(" "),
        creche: creche?.name || "",
        pictos: employe.code_pictos,
      }),
    );
    return json({ ok: true, sent_to: 1 });
  } catch (err) {
    console.error("[envoyer-code-pictos-employe]", err);
    return json({ error: (err as Error).message || "erreur_inconnue" }, 500);
  }
});
