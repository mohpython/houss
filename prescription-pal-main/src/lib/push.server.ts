/**
 * Firebase Cloud Messaging (HTTP v1) sender — server only.
 *
 * Requires the secret FIREBASE_SERVICE_ACCOUNT_JSON: the JSON key file of a
 * Firebase service account (Project settings > Service accounts > Generate
 * new private key). Never expose it to the client.
 */

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function b64url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key.replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`FCM auth failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: now + json.expires_in };
  return json.access_token;
}

export function getServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

export type PushPayload = {
  title: string;
  body: string;
  link: string;
  tag?: string;
};

export type SendResult = { token: string; ok: boolean; invalid: boolean };

/** Sends one notification to a single device token. */
export async function sendToToken(
  sa: ServiceAccount,
  token: string,
  payload: PushPayload,
): Promise<SendResult> {
  const accessToken = await getAccessToken(sa);
  // Le navigateur n'accepte qu'une URL absolue dans `fcm_options.link` (c'est
  // lui qui ouvre la notification affichee par le SDK, hors de notre
  // service worker qui gere lui-meme le clic).
  const absoluteLink = payload.link.startsWith("http")
    ? payload.link
    : `${(process.env.APP_URL ?? "https://sahasantemali.com").replace(/\/+$/, "")}${payload.link}`;
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: { link: payload.link },
          android: {
            priority: "HIGH",
            notification: {
              channel_id: "saha_default",
              default_sound: true,
              tag: payload.tag,
              click_action: "FLUTTER_NOTIFICATION_CLICK",
            },
          },
          apns: {
            headers: { "apns-priority": "10" },
            payload: { aps: { sound: "default", "content-available": 1 } },
          },
          webpush: {
            headers: { Urgency: "high" },
            notification: {
              title: payload.title,
              body: payload.body,
              icon: "/favicon.png",
              badge: "/favicon.png",
              tag: payload.tag,
            },
            fcm_options: { link: absoluteLink },
          },
        },
      }),
    },
  );

  if (res.ok) return { token, ok: true, invalid: false };
  const text = await res.text();
  const invalid =
    res.status === 404 ||
    text.includes("UNREGISTERED") ||
    text.includes("INVALID_ARGUMENT");
  console.error("FCM send failed", res.status, text.slice(0, 300));
  return { token, ok: false, invalid };
}
