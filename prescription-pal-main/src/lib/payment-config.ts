/** Mobile money merchant numbers shown to the patient at checkout. */
export const MERCHANT_NUMBERS = {
  orange_money: "+223 70 00 00 00",
  moov_money: "+223 60 00 00 00",
} as const;

export type PaymentMethod = keyof typeof MERCHANT_NUMBERS;

export const CURRENCY = "FCFA";

/**
 * Frais de livraison en FCFA (le retrait en pharmacie est gratuit).
 *
 * La valeur vit ici, et non dans un fichier `.server.ts`, parce que le client en
 * a besoin aussi : au changement de mode de remise il recalcule le total
 * immédiatement, avant la réponse du serveur. Les fichiers serveur
 * (`routing-core.server.ts`, `fulfillment.functions.ts`) importent cette meme
 * constante, pour que le montant affiché et le montant débité ne puissent pas
 * diverger.
 */
export const DELIVERY_FEE = 1000;

/**
 * Frais de commande en FCFA, prélevés sur chaque commande (retrait ou
 * livraison). La pharmacie les accepte via la case à cocher « Frais de
 * commande » au moment du paiement — le bouton « Payer » reste inactif
 * tant que le patient n'a pas coché la case.
 *
 * Même raisonnement que DELIVERY_FEE : la constante vit ici car le client
 * en a besoin pour le total affiché avant confirmation serveur.
 */
export const ORDER_FEE = 100;

export function formatAmount(value: number | null | undefined) {
  return `${Math.round(value ?? 0).toLocaleString("fr-FR")} ${CURRENCY}`;
}
