/**
 * Meta WhatsApp Cloud API client — server only.
 * Never import from client code.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

function creds() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw new Error("WhatsApp non configuré");
  return { token, phoneId };
}

async function post(body: Record<string, unknown>) {
  const { token, phoneId } = creds();
  const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[whatsapp] send failed [${res.status}]: ${text}`);
    throw new Error(`WhatsApp send failed [${res.status}]: ${text}`);
  }
  return res.json();
}

export async function sendText(to: string, body: string, preview = false) {
  return post({
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: preview, body: body.slice(0, 4000) },
  });
}

export type Button = { id: string; title: string };

export async function sendButtons(
  to: string,
  body: string,
  buttons: Button[],
  header?: string,
  footer?: string,
) {
  return post({
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      ...(header ? { header: { type: "text", text: header.slice(0, 60) } } : {}),
      body: { text: body.slice(0, 1024) },
      ...(footer ? { footer: { text: footer.slice(0, 60) } } : {}),
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}

export async function sendLocationRequest(to: string, body: string) {
  return post({
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "location_request_message",
      body: { text: body.slice(0, 1024) },
      action: { name: "send_location" },
    },
  });
}

export async function markRead(messageId: string) {
  try {
    const { token, phoneId } = creds();
    await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
  } catch {
    /* non-blocking */
  }
}

export type DownloadedMedia = { bytes: Uint8Array; mimeType: string };

/** Two-step Cloud API media download: resolve the URL, then fetch it with the token. */
export async function downloadMedia(mediaId: string): Promise<DownloadedMedia> {
  const { token } = creds();
  const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) {
    throw new Error(`WhatsApp media lookup failed [${metaRes.status}]: ${await metaRes.text()}`);
  }
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) throw new Error("WhatsApp media URL manquante");

  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileRes.ok) {
    throw new Error(`WhatsApp media download failed [${fileRes.status}]`);
  }
  return {
    bytes: new Uint8Array(await fileRes.arrayBuffer()),
    mimeType: meta.mime_type ?? "image/jpeg",
  };
}

/**
 * Message basé sur un modèle approuvé (obligatoire hors fenêtre de 24 h).
 * Utilisé pour les codes de connexion (modèle de catégorie « Authentification »).
 */
export async function sendAuthTemplate(to: string, template: string, lang: string, code: string) {
  return post({
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: template,
      language: { code: lang },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
      ],
    },
  });
}
