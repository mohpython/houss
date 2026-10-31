/**
 * Client Orange Money WebPay — paiement en ligne Mali.
 *
 * Référence : Orange Developer, produit « Orange Money Web Payment / M Payment 1.0 »
 * Doc : https://developer.orange.com/apis/om-webpay
 *
 * Flux :
 *  1. POST /oauth/v3/token        → access_token (valide ~1h, mis en cache)
 *  2. POST /{api}/webpayment      → payment_url + pay_token + notif_token
 *  3. Redirige le patient vers payment_url
 *  4. Orange appelle notif_url    → notification serveur-à-serveur
 *  5. GET  /{api}/webpayment/{order_id}/status → vérification finale
 *
 * En dev (Orange Money WebPay Dev), la devise est OUV et les montants sont
 * fictifs. En production Mali, la devise est XOF et les montants sont réels.
 */

const OAUTH_URL = "https://api.orange.com/oauth/v3/token";

let tokenCache: { token: string; expiresAt: number } | null = null;

function getConfig() {
  const clientId = process.env.ORANGE_MONEY_CLIENT_ID;
  const clientSecret = process.env.ORANGE_MONEY_CLIENT_SECRET;
  const merchantKey = process.env.ORANGE_MONEY_MERCHANT_KEY;
  if (!clientId || !clientSecret || !merchantKey) {
    throw new Error(
      "Orange Money non configuré (ORANGE_MONEY_CLIENT_ID / CLIENT_SECRET / MERCHANT_KEY manquants)",
    );
  }
  const apiPath = process.env.ORANGE_MONEY_API_PATH || "orange-money-webpay/dev/v1";
  const currency = process.env.ORANGE_MONEY_CURRENCY || "OUV";
  return { clientId, clientSecret, merchantKey, apiPath, currency };
}

function getBaseUrl() {
  return `https://api.orange.com/${getConfig().apiPath}`;
}

function getUrls(baseUrl: string) {
  const notifyUrl =
    process.env.ORANGE_MONEY_NOTIF_URL || `${baseUrl}/api/public/payments/orange/notify`;
  const returnUrl =
    process.env.ORANGE_MONEY_RETURN_URL || `${baseUrl}/app/payments/orange/return`;
  return { notifyUrl, returnUrl };
}

/**
 * Obtient un access_token OAuth2 (client_credentials).
 * Mis en cache jusqu'à 1 minute avant expiration.
 */
export async function getOrangeAccessToken(): Promise<string> {
  const { clientId, clientSecret } = getConfig();
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Orange Money token failed [${res.status}]: ${text}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  if (!json.access_token) throw new Error("Orange Money: access_token absent de la réponse");
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
  };
  return json.access_token;
}

/** Remet à zéro le cache du token (utile en test). */
export function _resetOrangeTokenCache() {
  tokenCache = null;
}

/**
 * Orange Money refuse les caractères non ASCII et toute `reference` de plus
 * de 30 caractères (« Invalid body field: reference ... bad syntax »).
 */
function toAsciiReference(input: string, max = 30): string {
  const ascii = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .replace(/[\s._-]+$/, "")
    .trim();
  return ascii || "SAHA Sante";
}

export interface OrangePaymentInitParams {
  reservationId: string;
  amount: number;
  description: string;
  lang?: "fr" | "en";
  /**
   * Merchant key propre à la pharmacie payée. Si absent, on retombe sur
   * ORANGE_MONEY_MERCHANT_KEY (compte par défaut SAHA).
   */
  merchantKey?: string | null;
}

export interface OrangePaymentInitResult {
  orderId: string;
  payToken: string;
  notifToken: string;
  paymentUrl: string;
}

/**
 * Initie un paiement Orange Money WebPay.
 * Retourne l'URL de paiement et les jetons de réconciliation.
 */
export async function initOrangePayment(
  params: OrangePaymentInitParams,
  baseUrl: string,
): Promise<OrangePaymentInitResult> {
  const { merchantKey: defaultMerchantKey, currency } = getConfig();
  const merchantKey = params.merchantKey?.trim() || defaultMerchantKey;
  const { notifyUrl, returnUrl } = getUrls(baseUrl);

  // Orange ne renvoie aucun identifiant dans l'URL de retour : on l'encode
  // nous-mêmes pour que la page de retour sache quelle commande vérifier.
  // `cancel_url` ajoute `cancelled=1` pour distinguer immédiatement un clic sur
  // « Annuler la Transaction » / « Revenir sur le site du marchand ».
  const sep = returnUrl.includes("?") ? "&" : "?";
  const returnWithOrder = `${returnUrl}${sep}rid=${encodeURIComponent(params.reservationId)}`;
  const cancelWithOrder = `${returnWithOrder}&cancelled=1`;
  const token = await getOrangeAccessToken();

  // order_id unique : format SAHA-{8 premiers caractères reservationId}-{timestamp}
  const orderId = `SAHA-${params.reservationId.slice(0, 8)}-${Date.now()}`;
  const amount = Math.round(params.amount);

  const body: Record<string, unknown> = {
    merchant_key: merchantKey,
    currency,
    order_id: orderId,
    amount,
    return_url: returnWithOrder,
    cancel_url: cancelWithOrder,
    notif_url: notifyUrl,
    lang: params.lang || "fr",
    reference: toAsciiReference(params.description),
  };

  const res = await fetch(`${getBaseUrl()}/webpayment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    throw new Error(
      json.message || json.error_description || `Orange Money init failed [${res.status}]`,
    );
  }
  const payToken = json.pay_token || json.data?.pay_token;
  const paymentUrl = json.payment_url || json.data?.payment_url;
  const notifToken = json.notif_token || json.data?.notif_token;
  if (!payToken || !paymentUrl) {
    throw new Error("Orange Money: pay_token ou payment_url absent de la réponse");
  }
  return {
    orderId,
    payToken,
    notifToken: notifToken || "",
    paymentUrl,
  };
}

/**
 * Vérifie le statut réel d'une transaction Orange Money.
 * À appeler côté serveur avant de valider une commande — la redirection
 * navigateur seule n'est jamais une preuve de paiement.
 *
 * Endpoint : POST /{api}/transactionstatus
 * Corps : { order_id, amount, pay_token }
 * Réponse : { status: INITIATED | PENDING | EXPIRED | SUCCESS | FAILED | "NOT FOUND", order_id, txnid }
 */
export async function checkOrangePaymentStatus(
  orderId: string,
  amount: number,
  payToken: string,
): Promise<{ ok: boolean; status: string; raw: Record<string, any> }> {
  const { currency } = getConfig();
  const token = await getOrangeAccessToken();
  const res = await fetch(`${getBaseUrl()}/transactionstatus`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      order_id: orderId,
      amount: Math.round(amount),
      pay_token: payToken,
      currency,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  return {
    ok: res.ok,
    status: json.status || "UNKNOWN",
    raw: json,
  };
}
