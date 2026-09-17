// Edge function "generer-planning-ia"
// ============================================================================
// Génère une proposition de planning équipe pour les semaines à venir, à
// partir du motif observé sur des semaines déjà réalisées (planning_equipe).
// Ne touche PAS la base : elle renvoie une proposition, c'est demandes.html
// (module Planning équipe, bouton "Génération IA") qui l'écrit dans
// planning_equipe après validation par la direction / la directrice
// technique.
//
// Entrée attendue (JSON) :
//   {
//     crecheName: string,
//     nbSemainesSource: number,       // nombre de semaines fournies en exemple
//     nbSemainesAGenerer: number,      // nombre de semaines à proposer
//     sourceRows: [{ semaineIndex, jour, prenom, heureDebut, heureFin, pauseDebut, pauseFin }]
//   }
//   semaineIndex : 0 = plus ancienne semaine source, croissant.
//   jour : 0 = lundi ... 4 = vendredi.
//
// Sortie (JSON) :
//   { semaines: [{ decalageSemaines, creneaux: [{jour,prenom,heureDebut,heureFin,pauseDebut,pauseFin}] }],
//     remarques: string }
//   decalageSemaines : 0 = première semaine générée (celle qui suit direct-
//   ement les semaines source), croissant.
//
// Secret nécessaire : ANTHROPIC_API_KEY.
// Déploiement : supabase functions deploy generer-planning-ia
// ============================================================================

import Anthropic from "https://esm.sh/@anthropic-ai/sdk?target=deno";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const PROPOSER_TOOL = {
  name: "proposer_planning",
  description:
    "Propose le planning des semaines à venir en respectant le motif (rotation, alternances, contraintes par personne) observé sur les semaines déjà réalisées fournies en exemple.",
  input_schema: {
    type: "object",
    properties: {
      semaines: {
        type: "array",
        description: "Une entrée par semaine à générer, dans l'ordre.",
        items: {
          type: "object",
          properties: {
            decalageSemaines: {
              type: "integer",
              description: "0 = première semaine générée (juste après les semaines source), 1 = la suivante, etc.",
            },
            creneaux: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  jour: { type: "integer", description: "0=lundi, 1=mardi, 2=mercredi, 3=jeudi, 4=vendredi" },
                  prenom: { type: "string" },
                  heureDebut: { type: "string", description: "Format HH:MM" },
                  heureFin: { type: "string", description: "Format HH:MM" },
                  pauseDebut: { type: ["string", "null"], description: "Format HH:MM, ou null si pas de pause" },
                  pauseFin: { type: ["string", "null"], description: "Format HH:MM, ou null si pas de pause" },
                },
                required: ["jour", "prenom", "heureDebut", "heureFin"],
              },
            },
          },
          required: ["decalageSemaines", "creneaux"],
        },
      },
      remarques: {
        type: "string",
        description:
          "En français : le motif détecté (ex. rotation sur 2 semaines), les hypothèses faites, et toute incertitude ou incohérence relevée dans les semaines source.",
      },
    },
    required: ["semaines", "remarques"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { crecheName, nbSemainesSource, nbSemainesAGenerer, sourceRows } = await req.json();

    if (!Array.isArray(sourceRows) || !sourceRows.length) {
      return json({ error: "Aucune donnée source : sélectionnez des semaines déjà remplies." }, 400);
    }
    const nbGen = Math.max(1, Math.min(12, parseInt(String(nbSemainesAGenerer), 10) || 4));

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "Génération IA non configurée (clé API manquante)." }, 500);
    }
    const anthropic = new Anthropic({ apiKey });

    const prompt =
      `Voici le planning déjà réalisé de l'équipe de la crèche "${crecheName || ""}", sur ${nbSemainesSource || "plusieurs"} semaine(s), ` +
      `au format JSON (jour 0=lundi...4=vendredi, semaineIndex 0=plus ancienne) :\n\n` +
      JSON.stringify(sourceRows) +
      `\n\nDétecte le motif de rotation de l'équipe (qui travaille quel jour, sur quel horaire, et selon quel cycle en nombre de semaines — ` +
      `souvent le nombre de semaines fournies, ou un diviseur de celui-ci). Respecte les contraintes que tu peux déduire (ex. une personne absente ` +
      `systématiquement un jour donné, une alternance stricte entre deux personnes). Propose ensuite les ${nbGen} semaine(s) suivante(s) en ` +
      `poursuivant ce motif. N'invente pas de salarié·e qui n'apparaît pas dans les données source. Utilise l'outil proposer_planning pour répondre.`;

    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      tools: [PROPOSER_TOOL],
      tool_choice: { type: "tool", name: "proposer_planning" },
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "La génération a été refusée par l'IA." }, 502);
    }

    const content = response.content as Array<{ type: string; input?: unknown }>;
    const toolUse = content.find((b) => b.type === "tool_use");

    if (!toolUse || !toolUse.input) {
      return json({ error: "Réponse de l'IA inattendue (pas de proposition)." }, 502);
    }

    return json(toolUse.input as Record<string, unknown>);
  } catch (err) {
    console.error("[generer-planning-ia]", err);
    return json({ error: err instanceof Error ? err.message : "Erreur inattendue." }, 500);
  }
});
