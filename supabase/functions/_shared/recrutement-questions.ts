// Questions par défaut du questionnaire « projet pédagogique » envoyé aux
// candidat·e·s (module Recrutement). Utilisées tant que la direction n'a pas
// enregistré les siennes (table recrutement_reglages). À garder en phase avec
// RC_QUESTIONS_DEFAUT de js/pages/demandes/26-recrutement.js.
export const QUESTIONS_DEFAUT = [
  "Qu'avez-vous retenu de notre projet pédagogique ?",
  "Quelles valeurs du projet vous parlent le plus, et pourquoi ?",
  "Un enfant pleure au moment de la séparation du matin : comment l'accompagnez-vous, lui et son parent ?",
  "Comment trouvez-vous votre place dans une équipe que vous rejoignez pour un remplacement ?",
  "Qu'aimeriez-vous apporter aux enfants pendant ce remplacement ?",
  "Avez-vous des questions sur le projet ou sur le poste ?",
];

export const QUESTIONS_MAX = 12;
export const REPONSE_MAX = 3000;

/** Les questions en vigueur pour une organisation (réglages, sinon défaut). */
// deno-lint-ignore no-explicit-any
export async function questionsDe(sb: any, orgId: string | null | undefined): Promise<string[]> {
  if (orgId) {
    const { data } = await sb.from("recrutement_reglages").select("questions").eq("org_id", orgId).maybeSingle();
    const q = Array.isArray(data?.questions)
      ? data.questions.map((x: unknown) => String(x || "").trim()).filter(Boolean).slice(0, QUESTIONS_MAX)
      : [];
    if (q.length) return q;
  }
  return QUESTIONS_DEFAUT;
}
