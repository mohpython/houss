/** Mobile money merchant numbers shown to the patient at checkout. */
export const MERCHANT_NUMBERS = {
  orange_money: "+223 70 00 00 00",
  moov_money: "+223 60 00 00 00",
} as const;

export type PaymentMethod = keyof typeof MERCHANT_NUMBERS;

export const CURRENCY = "FCFA";

export function formatAmount(value: number | null | undefined) {
  return `${Math.round(value ?? 0).toLocaleString("fr-FR")} ${CURRENCY}`;
}
