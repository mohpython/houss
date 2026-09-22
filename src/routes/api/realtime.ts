import { createFileRoute } from "@tanstack/react-router";

/**
 * Flux temps réel (Server-Sent Events) — remplace Supabase Realtime.
 * Le navigateur s'y connecte via `src/integrations/realtime/client.ts`.
 * EventSource ne permettant pas d'en-tête Authorization, le jeton de session
 * est passé en paramètre `token` (HTTPS obligatoire en production).
 */
export const Route = createFileRoute("/api/realtime")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const { verifySessionToken } = await import("@/server/auth.server");
        const userId = await verifySessionToken(url.searchParams.get("token"));
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const { isAdmin } = await import("@/server/authz.server");
        const { onRealtimeEvent } = await import("@/server/realtime.server");
        let admin = await isAdmin(userId);
        const encoder = new TextEncoder();
        let cleanup = () => {};

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            let closed = false;
            const send = (chunk: string) => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(chunk));
              } catch {
                cleanup();
              }
            };

            send(`retry: 3000\nevent: ready\ndata: {}\n\n`);

            const off = onRealtimeEvent((e) => {
              if (!e.users.includes(userId) && !(e.admins && admin)) return;
              send(`data: ${JSON.stringify({ table: e.table, type: e.type, row: e.row })}\n\n`);
            });
            const heartbeat = setInterval(() => send(`: ping\n\n`), 25_000);
            // Le rôle admin peut changer pendant la connexion.
            const roleRefresh = setInterval(async () => {
              admin = await isAdmin(userId).catch(() => admin);
            }, 5 * 60_000);

            cleanup = () => {
              if (closed) return;
              closed = true;
              off();
              clearInterval(heartbeat);
              clearInterval(roleRefresh);
              try {
                controller.close();
              } catch {
                /* déjà fermé */
              }
            };
            request.signal.addEventListener("abort", () => cleanup());
          },
          cancel() {
            cleanup();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            // Désactive la mise en tampon de Nginx pour ce flux.
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
