/**
 * Phrases de guidage vocal en bambara.
 *
 * Les textes bambara sont fournis par un locuteur natif : aucune traduction
 * automatique n'est injectée ici. Tant que `bm` est vide, le bouton
 * « Écouter » conserve la voix française du navigateur ; dès qu'une phrase est
 * renseignée et que SVARA_API_KEY est configurée, elle est lue en bambara.
 *
 * Le champ `fr` sert de référence au traducteur : c'est le sens à rendre,
 * pas nécessairement le texte affiché à l'écran.
 */
type BambaraPhrase = {
  /** Texte français de référence. */
  fr: string;
  /** Traduction bambara validée par un locuteur natif. */
  bm: string;
};

export const BAMBARA_PHRASES = {
  "scan.location": {
    fr: "Lieu de livraison. Choisissez le lieu où vous voulez recevoir vos médicaments.",
    bm: "",
  },
  "checkout.payment": {
    fr: "Votre commande. Vérifiez le total, puis choisissez la livraison ou le retrait.",
    bm: "",
  },
  "track.delivery": {
    fr: "Suivi de votre commande. Voici votre code de retrait et l'état de votre livraison.",
    bm: "",
  },
  "track.pickup": {
    fr: "Retrait de votre commande. Voici votre code de retrait et l'état de votre commande.",
    bm: "",
  },
  "pharmacy.incoming": {
    fr: "Commandes reçues. Préparez les médicaments et remettez le code de retrait au patient.",
    bm: "",
  },
} satisfies Record<string, BambaraPhrase>;

export type BambaraPhraseKey = keyof typeof BAMBARA_PHRASES;

/** Texte bambara prêt à être synthétisé, ou `undefined` s'il n'est pas fourni. */
export function bambaraPhrase(key: BambaraPhraseKey): string | undefined {
  const text = BAMBARA_PHRASES[key].bm.trim();
  return text || undefined;
}
