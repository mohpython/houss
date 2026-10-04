/**
 * Client Orange SMS — canal "mot de passe à usage unique".
 *
 * Référence : Orange Developer, produit « SMS Middle East and Africa »
 * (endpoint équivalent pour le Mali, `developer.orange.com/apis/sms-ml`).
 * Ne pas importer depuis du code client.
 *
 * Flux :
 *  1. Obtenir un jeton OAuth2 (client_credentials) auprès de `TOKEN_URL`.
 *  2. Envoyer le SMS à `SEND_URL` avec ce jeton en Bearer.
 *
 * Les deux URL sont surchargeables via les variables d'environnement pour
 * absorber une éventuelle divergence du produit « SMS Mali (Business) » — sans
 * toucher au code.
 */

import { env } from "@/server/env.server";

const TOKEN_URL_DEFAULT = "https://api.orange.com/oauth/v3/token";
const SEND_URL_TEMPLATE =
  "https://api.orange.com/smsmessaging/v1/outbound/{senderAddress}/requests";

export function orangeSmsConfigured(): boolean {
  return Boolean(
    env.orangeSmsClientId && env.orangeSmsClientSecret && env.orangeSmsSender,
  );
}

function creds() {
  const id = env.orangeSmsClientId;
  const secret = env.orangeSmsClientSecret;
  const sender = env.orangeSmsSender;
  if (!id || !secret || !sender) throw new Error("Orange SMS non configuré");
  return { id, secret, sender };
}

/** Normalise le numéro expéditeur en « tel:+223… » (débutant par le + requis). */
function senderAddress(sender: string): string {
  const trimmed = sender.trim();
  const withPlus = trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
  return `tel:${withPlus}`;
}

// Jeton mémorisé : il est valide `expires_in` secondes (≈ 1 h), on évite donc
// de refaire un aller-retour OAuth à chaque SMS. On le renouvelle une minute
// avant son expiration déclarée.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const { id, secret } = creds();
  const url = env.orangeSmsTokenUrl || TOKEN_URL_DEFAULT;
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[orange-sms] token failed [${res.status}]: ${text.slice(0, 300)}`);
    throw new Error(`Orange SMS token failed [${res.status}]`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Orange SMS: jeton absent de la réponse");
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

/** Stoppe la garde du jeton si les identifiants changent (utile en tests). */
export function _resetOrangeTokenCache() {
  cachedToken = null;
}

export async function sendSms(to: string, message: string): Promise<void> {
  const { sender } = creds();
  const token = await getToken();

  const url =
    env.orangeSmsSendUrl ||
    SEND_URL_TEMPLATE.replace("{senderAddress}", encodeURIComponent(senderAddress(sender)));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      outboundSMSMessageRequest: {
        address: `tel:${to.startsWith("+") ? to : `+${to}`}`,
        senderAddress: senderAddress(sender),
        outboundSMSTextMessage: { message: message.slice(0, 1600) },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[orange-sms] send failed [${res.status}]: ${text.slice(0, 300)}`);
    throw new Error(`Orange SMS send failed [${res.status}]`);
  }
}
