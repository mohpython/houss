import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/;

/**
 * Téléversement d'un fichier d'ordonnance (remplace supabase.storage.upload).
 * Requête multipart avec le champ `file` et l'en-tête Authorization: Bearer.
 * Réponse : `{ path, mime }` — `path` est la clé à enregistrer dans
 * `prescriptions.file_path` (toujours préfixée par l'id de l'utilisateur).
 *
 * Côté navigateur, utiliser `uploadPrescriptionFile()` de
 * `src/integrations/storage/client.ts`.
 */
export const Route = createFileRoute("/api/storage/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { bearerFromRequest, verifySessionToken } = await import("@/server/auth.server");
        const userId = await verifySessionToken(bearerFromRequest(request));
        if (!userId) return Response.json({ error: "Non connecté" }, { status: 401 });

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "Requête invalide" }, { status: 400 });
        }
        const file = form.get("file");
        if (!(file instanceof File)) {
          return Response.json({ error: "Fichier manquant" }, { status: 400 });
        }
        const mime = file.type || "image/jpeg";
        if (!ALLOWED.test(mime)) {
          return Response.json({ error: "Format non accepté (photo ou PDF uniquement)" }, { status: 415 });
        }
        if (file.size > MAX_BYTES) {
          return Response.json({ error: "Fichier trop volumineux (15 Mo maximum)" }, { status: 413 });
        }

        const { saveObject, extFromMime } = await import("@/server/storage.server");
        const { randomUUID } = await import("node:crypto");
        const path = `${userId}/${randomUUID()}.${extFromMime(mime, file.name)}`;
        await saveObject("prescriptions", path, new Uint8Array(await file.arrayBuffer()));
        return Response.json({ path, mime });
      },
    },
  },
});
