import { createFileRoute } from "@tanstack/react-router";

const MAX_CHARS = 600;
const LANG = "bam";

/**
 * Synthèse vocale bambara (Svara TTS Turbo).
 *
 * GET  -> `{ configured }` : le client sait s'il peut tenter la voix bambara.
 * POST -> `{ text }` -> audio/mpeg. Les phrases sont mises en cache sur disque :
 *         un même texte n'est synthétisé (et facturé) qu'une seule fois.
 *
 * L'authentification est obligatoire pour la synthèse : la clé Svara ne doit
 * jamais être exposée au navigateur.
 */
export const Route = createFileRoute("/api/tts/bambara")({
  server: {
    handlers: {
      GET: async () => {
        const { env } = await import("@/server/env.server");
        return Response.json(
          { configured: env.bambaraTtsConfigured },
          { headers: { "Cache-Control": "public, max-age=300" } },
        );
      },

      POST: async ({ request }) => {
        const { bearerFromRequest, verifySessionToken } = await import("@/server/auth.server");
        const userId = await verifySessionToken(bearerFromRequest(request));
        if (!userId) return Response.json({ error: "Non connecté" }, { status: 401 });

        const { rateLimit } = await import("@/server/rate-limit.server");
        try {
          rateLimit(`tts:${userId}`, 40, 60_000);
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Trop de demandes" },
            { status: 429 },
          );
        }

        let payload: { text?: unknown };
        try {
          payload = (await request.json()) as { text?: unknown };
        } catch {
          return Response.json({ error: "Requête invalide" }, { status: 400 });
        }

        const text =
          typeof payload.text === "string" ? payload.text.replace(/\s+/g, " ").trim() : "";
        if (!text) return Response.json({ error: "Texte manquant" }, { status: 400 });
        if (text.length > MAX_CHARS) {
          return Response.json(
            { error: `Texte trop long (${MAX_CHARS} caractères maximum)` },
            { status: 413 },
          );
        }

        const { env } = await import("@/server/env.server");
        if (!env.bambaraTtsConfigured) {
          return Response.json({ error: "Voix bambara non configurée" }, { status: 503 });
        }

        const { createHash } = await import("node:crypto");
        const hash = createHash("sha256")
          .update(`${env.svaraVoice}\n${env.svaraModel}\n${LANG}\n${text}`)
          .digest("hex");
        const key = `${hash.slice(0, 2)}/${hash}.mp3`;

        const { objectExists, readObject, saveObject } = await import("@/server/storage.server");
        let audio: Buffer | null = null;
        try {
          if (await objectExists("tts", key)) audio = await readObject("tts", key);
        } catch {
          audio = null;
        }

        if (!audio) {
          try {
            const res = await fetch(`${env.svaraBaseUrl}/audio/speech`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${env.svaraApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: env.svaraModel,
                input: text,
                voice: env.svaraVoice,
                lang: LANG,
                response_format: "mp3",
              }),
              signal: AbortSignal.timeout(20_000),
            });

            if (!res.ok) {
              const detail = (await res.text().catch(() => "")).slice(0, 300);
              console.error(`[tts] Svara ${res.status}: ${detail}`);
              return Response.json({ error: "Voix bambara indisponible" }, { status: 502 });
            }

            const type = res.headers.get("content-type") ?? "";
            if (!type.startsWith("audio/")) {
              console.error(`[tts] Réponse Svara inattendue (${type})`);
              return Response.json({ error: "Voix bambara indisponible" }, { status: 502 });
            }

            audio = Buffer.from(await res.arrayBuffer());
            if (!audio.length) {
              return Response.json({ error: "Audio vide" }, { status: 502 });
            }
            await saveObject("tts", key, audio);
          } catch (err) {
            console.error("[tts] Échec de la synthèse bambara", err);
            return Response.json({ error: "Voix bambara indisponible" }, { status: 502 });
          }
        }

        if (!audio) {
          return Response.json({ error: "Voix bambara indisponible" }, { status: 502 });
        }

        return new Response(new Uint8Array(audio), {
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": String(audio.byteLength),
            "Cache-Control": "private, max-age=86400",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
