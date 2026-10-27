const API_BASE = "https://api-checkout.cinetpay.com/v2";

export interface CinetPayInitParams {
  reservationId: string;
  amount: number;
  currency?: string;
  description: string;
  customerName?: string;
  customerSurname?: string;
  customerEmail?: string;
  customerPhoneNumber?: string;
  notifyUrl?: string;
  returnUrl?: string;
  channels?: string;
  lang?: string;
}

function getConfig() {
  const siteId = process.env.CINETPAY_SITE_ID;
  const apiKey = process.env.CINETPAY_API_KEY;
  const secretKey = process.env.CINETPAY_SECRET_KEY;
  if (!siteId || !apiKey || !secretKey) {
    throw new Error("CinetPay non configuré (CINETPAY_SITE_ID/API_KEY/SECRET_KEY manquants)");
  }
  return { siteId, apiKey, secretKey };
}

function getUrls(baseUrl: string) {
  const notifyUrl = process.env.CINETPAY_NOTIFY_URL || `${baseUrl}/api/public/payments/cinetpay/notify`;
  const returnUrl = process.env.CINETPAY_RETURN_URL || `${baseUrl}/app/payments/cinetpay/return`;
  return { notifyUrl, returnUrl };
}

export async function initCinetPayPayment(params: CinetPayInitParams, baseUrl: string) {
  const { siteId, apiKey } = getConfig();
  const { notifyUrl, returnUrl } = getUrls(baseUrl);
  const transactionId = `SAHA-${params.reservationId.slice(0, 8)}-${Date.now()}`;
  const body = {
    apikey: apiKey,
    site_id: siteId,
    transaction_id: transactionId,
    amount: Math.round(params.amount),
    currency: params.currency || "XOF",
    description: params.description,
    customer_name: params.customerName || "Client",
    customer_surname: params.customerSurname || "SAHA",
    customer_email: params.customerEmail || "client@sahasantemali.com",
    customer_phone_number: params.customerPhoneNumber || "",
    notify_url: notifyUrl,
    return_url: returnUrl,
    channels: params.channels || "ALL",
    lang: params.lang || "FR",
    metadata: JSON.stringify({ reservationId: params.reservationId }),
  };

  const res = await fetch(`${API_BASE}/payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.code !== "201") {
    throw new Error(json.message || "Erreur initialisation CinetPay");
  }
  return {
    transactionId,
    paymentUrl: json.data.payment_url,
    paymentToken: json.data.payment_token,
  };
}

export async function verifyCinetPayPayment(transactionId: string) {
  const { siteId, apiKey } = getConfig();
  const res = await fetch(`${API_BASE}/payment/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: apiKey, site_id: siteId, transaction_id: transactionId }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: json.data?.status, raw: json };
}
