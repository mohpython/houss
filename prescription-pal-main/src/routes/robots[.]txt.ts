import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/**
 * robots.txt généré dynamiquement : l'URL du sitemap suit la configuration
 * serveur (APP_URL), donc le domaine réellement servi. Le fichier statique
 * `public/robots.txt` a été supprimé pour éviter deux sources de vérité.
 */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => {
        const { env } = await import("@/server/env.server");
        const body = [
          "User-agent: *",
          "Allow: /",
          "Disallow: /app/",
          "Disallow: /auth",
          "Disallow: /auth-callback",
          "Disallow: /api/",
          "",
          `Sitemap: ${env.appUrl}/sitemap.xml`,
          "",
        ].join("\n");

        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
