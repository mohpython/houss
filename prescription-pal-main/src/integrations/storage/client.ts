import { getAccessToken } from "@/integrations/auth/session-store";

/**
 * Téléverse un fichier d'ordonnance sur le serveur (remplace
 * `supabase.storage.from("prescriptions").upload(...)`).
 * Renvoie la clé à stocker dans `prescriptions.file_path`.
 */
export async function uploadPrescriptionFile(file: File): Promise<{ path: string; mime: string }> {
  const token = getAccessToken();
  if (!token) throw new Error("Session expirée, reconnectez-vous.");
  const body = new FormData();
  body.append("file", file, file.name || "ordonnance.jpg");
  const res = await fetch("/api/storage/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    path?: string;
    mime?: string;
    error?: string;
  };
  if (!res.ok || !json.path) throw new Error(json.error ?? "Échec du téléversement");
  return { path: json.path, mime: json.mime ?? file.type };
}
