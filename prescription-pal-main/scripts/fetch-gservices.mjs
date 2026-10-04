// Récupère google-services.json via l'API de gestion Firebase, en s'authentifiant
// avec le compte de service admin (JWT → access token), puis écrit
// houss/App-mobile/android/app/google-services.json.
import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const KEY = process.argv[2];
const APP_ID = "1:991636499809:android:f15bda3f5a4f81e3ea6920";
const OUT = process.argv[3];

function b64url(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const sa = JSON.parse(readFileSync(KEY, "utf8"));
const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const claim = b64url(
  JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }),
);
const key = await webcrypto.subtle.importKey(
  "pkcs8",
  Buffer.from(
    sa.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/\s+/g, ""),
    "base64",
  ),
  { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
  false,
  ["sign"],
);
const sig = b64url(
  await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`)),
);
const assertion = `${header}.${claim}.${sig}`;

const res = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
});
if (!res.ok) {
  console.error("Token failed", res.status, await res.text());
  process.exit(1);
}
const { access_token } = await res.json();

const cfgRes = await fetch(
  `https://firebasemanagement.googleapis.com/v1/projects/sahasante/androidApps/${encodeURIComponent(APP_ID)}/config`,
  { headers: { Authorization: `Bearer ${access_token}` } },
);
if (!cfgRes.ok) {
  console.error("Config failed", cfgRes.status, await cfgRes.text());
  process.exit(1);
}
const json = await cfgRes.json();
writeFileSync(OUT, JSON.stringify(json, null, 2));
console.log("OK ->", OUT);
console.log("project_id:", json.project_info?.project_id, "| app_id:", json.client?.[0]?.client_info?.mobilesdk_app_id);
