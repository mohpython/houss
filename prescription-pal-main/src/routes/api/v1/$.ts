import { createFileRoute } from "@tanstack/react-router";

/**
 * API REST de l'application mobile — voir `src/server/api-v1.server.ts`
 * pour la liste des routes.
 */
const handler = async ({ request }: { request: Request }) => {
  const { handleApiV1 } = await import("@/server/api-v1.server");
  return handleApiV1(request);
};

export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: { GET: handler, POST: handler, PUT: handler, DELETE: handler },
  },
});
