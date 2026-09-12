// Edge function "envoyer-code-pictos"
// ============================================================================
// Envoie par e-mail (SMTP Gmail) le code image (4 pictogrammes) d'un enfant
// aux parents marqués "destinataire" (ou à défaut tous les parents ayant un
// e-mail) — pendant de envoyer-code-pointage, mais pour le code kiosque des
// enfants, qui utilise des pictogrammes plutôt que 4 chiffres depuis le
// changement décrit dans demandes.html (section "CODE IMAGE (kiosque,
// enfants uniquement)").
//
// Le code numérique (enfants.code_pointage) continue de servir en interne à
// l'authentification kiosque (kk_kiosk_pointer) ; enfants.code_pictos n'est
// qu'une correspondance visuelle affichée à l'écran et dans ce mail — cette
// fonction ne renvoie jamais le code numérique, seulement les images.
//
// Appelée depuis demandes.html avec l'anon key : le filtrage par droits est
// déjà fait côté client (module visible aux comptes direction/référente
// seulement), et cette fonction ne lit que l'enfant demandé, via son id.
//
// Déploiement :
//   supabase functions deploy envoyer-code-pictos
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
  // "From" doit obligatoirement être l'adresse authentifiée elle-même : Gmail
  // rejette silencieusement tout expéditeur différent du compte SMTP utilisé.
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

// Même bucket public "assets" que demandes.html (constante KK_PICTOS) — les
// noms d'image doivent rester synchronisés avec ceux utilisés côté kiosque.
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

function pictosEmailHtml(opts: { enfant: string; creche: string; pictos: string[] }) {
  const images = opts.pictos.map((id) =>
    `<img src="${KK_PICTOS[id] || ""}" alt="${id}" width="70" height="70"
       style="width:70px;height:70px;border-radius:12px;object-fit:cover;margin:0 6px">`
  ).join("");
  return `
    <div style="font-family:'Nunito',Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#4A3F9F;margin:0 0 4px">Code de pointage de ${opts.enfant}</h2>
      <p style="color:#8E8AA8;margin:0 0 20px">À utiliser sur la tablette de pointage — ${opts.creche}</p>
      <div style="background:#F1EFF7;border-radius:16px;padding:20px;text-align:center;margin-bottom:18px">
        <div style="font-size:13px;color:#8E8AA8;margin-bottom:10px">Code de pointage</div>
        <div>${images}</div>
      </div>
      <p style="color:#2B2740;font-size:14px;line-height:1.6">
        Sur l'écran d'accueil de la tablette (mode kiosque), touchez ces 4 images, dans cet ordre,
        pour pointer l'arrivée et le départ de votre enfant. Ce code est propre à cet enfant :
        merci de ne pas le communiquer à d'autres familles.
      </p>
    </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { enfant_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps_invalide" }, 400);
  }
  const { enfant_id } = body;
  if (!enfant_id) return json({ error: "enfant_id_manquant" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: enfant, error: eErr } = await supabase
      .from("enfants")
      .select("id, prenom, nom, code_pictos, creche_id")
      .eq("id", enfant_id)
      .maybeSingle();
    if (eErr) throw eErr;
    if (!enfant) return json({ error: "enfant_introuvable" }, 404);
    if (!Array.isArray(enfant.code_pictos) || enfant.code_pictos.length !== 4) {
      return json({ error: "code_absent" }, 400);
    }

    const { data: creche } = await supabase
      .from("creches").select("name").eq("id", enfant.creche_id).maybeSingle();

    const { data: parents, error: pErr } = await supabase
      .from("enfants_parents")
      .select("email, destinataire")
      .eq("enfant_id", enfant_id);
    if (pErr) throw pErr;
    const tous = (parents || []).filter((p) => p.email);
    const cibles = tous.filter((p) => p.destinataire);
    const emails = [...new Set((cibles.length ? cibles : tous).map((p) => p.email as string))];
    if (!emails.length) return json({ error: "aucun_email_parent" }, 400);

    await sendEmail(
      emails,
      `Code de pointage de ${enfant.prenom || "votre enfant"}`,
      pictosEmailHtml({
        enfant: `${enfant.prenom || ""} ${enfant.nom || ""}`.trim(),
        creche: creche?.name || "",
        pictos: enfant.code_pictos,
      }),
    );
    return json({ ok: true, sent_to: emails.length });
  } catch (err) {
    console.error("[envoyer-code-pictos]", err);
    return json({ error: (err as Error).message || "erreur_inconnue" }, 500);
  }
});
