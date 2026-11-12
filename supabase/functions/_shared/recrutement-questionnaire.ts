// Questionnaire sur le projet pédagogique proposé aux candidat·e·s (module
// Recrutement) : c'est un quiz du projet quiz-protocoles, le même que celui des
// stagiaires. La page candidat.html l'ouvre avec l'identité de la personne et
// `ref` = identifiant de la fiche : le résultat est enregistré côté quiz
// (table `resultats`) et relu dans la fiche par `kk_resultats_par_ref`.
// À garder en phase avec RC_QUESTIONNAIRE_URL de js/pages/demandes/26-recrutement.js.
export const QUESTIONNAIRE_URL =
  "https://koalakids-app.github.io/quiz-protocoles/index.html?quiz=a1137575-4960-44a6-b11f-afa245f26687";

// Statut proposé par le quiz (liste STATUTS de quiz-protocoles/index.html).
export const QUESTIONNAIRE_STATUT = "Salarié(e) en recrutement";
