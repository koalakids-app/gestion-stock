// Texte de l'accord des parents pour le classement automatique des photos par
// reconnaissance du visage (album photos, étape 2), signé en ligne dans l'Espace famille.
// ============================================================================
// Une seule source : le texte affiché à la famille ET le texte dont l'empreinte (SHA-256)
// est conservée avec la signature (album_accords_signatures.texte_hash). Toute modification
// du texte = nouvelle VERSION : une signature faite sur une ancienne version est refusée
// (« texte_modifie ») et la famille relit la nouvelle version.
// À faire relire par le DPO avant usage. Copie lisible : docs/album-accord-reconnaissance-visage.md
// (à garder en phase).
// ============================================================================

export const ACCORD_VISAGE = {
  version: "2026-11-v1",
  titre: "Classement automatique des photos par reconnaissance du visage",
  intro:
    "Pour gagner du temps et vous remettre facilement les photos de votre enfant, la crèche peut utiliser un outil " +
    "qui reconnaît son visage et range automatiquement ses photos dans son album. Pour cela, l'outil crée, à partir " +
    "d'une ou plusieurs photos de votre enfant, une empreinte numérique de son visage (une suite de chiffres, et non " +
    "une photo).",
  points: [
    "Cette empreinte et les photos restent dans l'outil de gestion de la crèche. Elles ne sont transmises à aucun service extérieur et ne servent à aucune autre finalité.",
    "Seuls les professionnels habilités de la crèche y ont accès. Les photos de votre enfant restent classées et contrôlées par l'équipe.",
    "À la fin de l'accueil, les photos vous sont remises, puis les photos, les photos de référence et l'empreinte sont supprimées.",
    "Votre accord est facultatif. Si vous le refusez, rien ne change pour votre enfant : ses photos sont classées à la main, sans reconnaissance du visage.",
    "Vous pouvez changer d'avis à tout moment, ici ou sur simple demande à la direction. L'empreinte et les photos de référence sont alors supprimées.",
  ],
  mentions:
    "Responsable du traitement : la crèche de votre enfant. Vous pouvez exercer vos droits d'accès, de rectification " +
    "et d'effacement auprès de la direction de la crèche, et saisir la CNIL (cnil.fr) en cas de difficulté.",
} as const;

/** Empreinte SHA-256 (hexadécimal) d'un texte. */
export async function sha256(texte: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Empreinte du texte signé (version + titre + intro + points + mentions). */
export function hashTexteAccord(): Promise<string> {
  return sha256(JSON.stringify([
    ACCORD_VISAGE.version, ACCORD_VISAGE.titre, ACCORD_VISAGE.intro, ACCORD_VISAGE.points, ACCORD_VISAGE.mentions,
  ]));
}
