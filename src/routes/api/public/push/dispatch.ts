import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { pushCopy, pushLink } from "@/lib/push-messages";

const BodySchema = z.object({
  notification_id: z.string().uuid(),
});

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/push/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.PUSH_DISPATCH_SECRET;
        const provided = request.headers.get("x-push-secret") ?? "";
        if (!expected || !timingSafeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let parsed: z.infer<typeof BodySchema>;
        try {
          parsed = BodySchema.parse(await request.json());
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const { getServiceAccount, sendToToken } = await import("@/lib/push.server");
        const sa = getServiceAccount();
        if (!sa) return new Response("Push not configured", { status: 200 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: notif } = await supabaseAdmin
          .from("notifications")
          .select("id, user_id, type, title, body, data")
          .eq("id", parsed.notification_id)
          .maybeSingle();
        if (!notif) return new Response("Not found", { status: 200 });

        const { data: tokens } = await supabaseAdmin
          .from("device_tokens")
          .select("token, language")
          .eq("user_id", notif.user_id);
        if (!tokens || tokens.length === 0) return new Response("No devices", { status: 200 });

        const data = (notif.data ?? {}) as Record<string, unknown>;
        const link = pushLink(notif.type, data);

        const results = await Promise.all(
          tokens.map((row) => {
            const copy = pushCopy(notif.type, row.language, {
              title: notif.title,
              body: notif.body,
            });
            return sendToToken(sa, row.token, {
              ...copy,
              link,
              tag: typeof data.reservation_id === "string" ? data.reservation_id : notif.id,
            }).catch(() => ({ token: row.token, ok: false, invalid: false }));
          }),
        );

        const stale = results.filter((r) => r.invalid).map((r) => r.token);
        if (stale.length > 0) {
          await supabaseAdmin.from("device_tokens").delete().in("token", stale);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
