import { createFileRoute } from "@tanstack/react-router";

/**
 * Sert un fichier stocké sur le VPS via une URL signée
 * (`/api/storage/<bucket>/<clé>?exp=...&sig=...`, générée par createSignedUrl).
 */
export const Route = createFileRoute("/api/storage/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const queryBucket = url.searchParams.get("bucket");
        const queryKey = url.searchParams.get("key");

        let bucket: string;
        let key: string;
        if (queryBucket && queryKey) {
          bucket = queryBucket;
          key = queryKey;
        } else {
          const splat = (params as { _splat?: string })._splat ?? "";
          const [pathBucket, ...rest] = splat.split("/");
          bucket = pathBucket;
          key = rest.map((s) => decodeURIComponent(s)).join("/");
        }

        const { verifySignedUrl, readObject, mimeFromKey, BUCKETS } =
          await import("@/server/storage.server");
        if (!BUCKETS.includes(bucket as (typeof BUCKETS)[number]) || !key) {
          return new Response("Not found", { status: 404 });
        }
        if (
          !verifySignedUrl(bucket, key, url.searchParams.get("exp"), url.searchParams.get("sig"))
        ) {
          return new Response("Lien expiré ou invalide", { status: 403 });
        }
        try {
          const data = await readObject(bucket as (typeof BUCKETS)[number], key);
          return new Response(new Uint8Array(data), {
            headers: {
              "Content-Type": mimeFromKey(key),
              "Cache-Control": "private, max-age=300",
              "X-Content-Type-Options": "nosniff",
              "Content-Disposition": "inline",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
