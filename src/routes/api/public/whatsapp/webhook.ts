/**
 * Meta WhatsApp Cloud API webhook.
 * GET  -> verification handshake (hub.challenge)
 * POST -> inbound messages, signature-verified with the app secret.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

type WaValue = {
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: Array<{
    id: string;
    from: string;
    type: string;
    text?: { body?: string };
    image?: { id?: string; mime_type?: string };
    document?: { id?: string; mime_type?: string };
    location?: { latitude?: number; longitude?: number; address?: string; name?: string };
    interactive?: {
      type?: string;
      button_reply?: { id?: string; title?: string };
      list_reply?: { id?: string; title?: string };
    };
  }>;
};

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token") ?? "";
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        const expected = process.env.WHATSAPP_VERIFY_TOKEN;
        if (mode === "subscribe" && expected && safeEqual(token, expected)) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const raw = await request.text();

        const appSecret = process.env.WHATSAPP_APP_SECRET;
        if (!appSecret) {
          console.error("[whatsapp] WHATSAPP_APP_SECRET missing");
          return new Response("Not configured", { status: 200 });
        }
        const provided = request.headers.get("x-hub-signature-256") ?? "";
        const expected = `sha256=${createHmac("sha256", appSecret).update(raw).digest("hex")}`;
        if (!safeEqual(provided, expected)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: { entry?: Array<{ changes?: Array<{ value?: WaValue }> }> };
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { handleInbound } = await import("@/lib/whatsapp-bot.server");
        const { markRead } = await import("@/lib/whatsapp.server");

        for (const entry of payload.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const value = change.value;
            const name = value?.contacts?.[0]?.profile?.name ?? null;

            for (const m of value?.messages ?? []) {
              // Idempotency: Meta retries deliveries.
              const { error: dupErr } = await supabaseAdmin
                .from("whatsapp_events")
                .insert({ message_id: m.id });
              if (dupErr) continue;

              void markRead(m.id);

              const buttonId =
                m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? undefined;

              await handleInbound({
                id: m.id,
                from: m.from,
                profileName: name,
                type: buttonId ? "interactive" : m.type,
                text: m.text?.body,
                buttonId,
                mediaId: m.image?.id ?? m.document?.id,
                mediaMime: m.image?.mime_type ?? m.document?.mime_type,
                location:
                  m.location?.latitude != null && m.location?.longitude != null
                    ? {
                        lat: m.location.latitude,
                        lng: m.location.longitude,
                        address: m.location.address ?? m.location.name ?? null,
                      }
                    : undefined,
              });
            }
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
