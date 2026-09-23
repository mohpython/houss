/**
 * Stockage de fichiers sur le disque du VPS (remplace Supabase Storage).
 *
 * Arborescence : `${STORAGE_DIR}/<bucket>/<clé>` (ex. prescriptions/<userId>/<uuid>.jpg).
 * Les fichiers ne sont jamais servis publiquement : on génère des URL signées
 * (HMAC, durée limitée) servies par la route `/api/storage/...`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env.server";

export const BUCKETS = ["prescriptions"] as const;
export type Bucket = (typeof BUCKETS)[number];

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  gif: "image/gif",
  pdf: "application/pdf",
};

export function mimeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function extFromMime(mime: string, fallbackName?: string): string {
  const fromName = fallbackName?.split(".").pop()?.toLowerCase();
  if (fromName && fromName in MIME_BY_EXT) return fromName;
  const hit = Object.entries(MIME_BY_EXT).find(([, m]) => m === mime);
  return hit ? hit[0] : "bin";
}

function root(): string {
  return path.resolve(env.storageDir);
}

/** Résout le chemin disque en interdisant toute sortie du dossier du bucket. */
function resolvePath(bucket: Bucket, key: string): string {
  if (!BUCKETS.includes(bucket)) throw new Error("Bucket inconnu");
  if (!key || key.includes("\0") || key.startsWith("/") || key.split("/").includes("..")) {
    throw new Error("Chemin de fichier invalide");
  }
  const base = path.join(root(), bucket);
  const full = path.resolve(base, key);
  if (!full.startsWith(base + path.sep)) throw new Error("Chemin de fichier invalide");
  return full;
}

export async function saveObject(bucket: Bucket, key: string, data: Uint8Array | Buffer) {
  const full = resolvePath(bucket, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function readObject(bucket: Bucket, key: string): Promise<Buffer> {
  return readFile(resolvePath(bucket, key));
}

export async function objectExists(bucket: Bucket, key: string): Promise<boolean> {
  try {
    await stat(resolvePath(bucket, key));
    return true;
  } catch {
    return false;
  }
}

export async function removeObjects(bucket: Bucket, keys: string[]) {
  await Promise.all(keys.map((k) => rm(resolvePath(bucket, k), { force: true })));
}

function sign(bucket: string, key: string, exp: number): string {
  return createHmac("sha256", env.appSecret).update(`${bucket}/${key}:${exp}`).digest("base64url");
}

/** URL relative signée, valable `expiresInSec` secondes (équivalent createSignedUrl). */
export function createSignedUrl(bucket: Bucket, key: string, expiresInSec = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `/api/storage/${bucket}/${encodedKey}?exp=${exp}&sig=${sign(bucket, key, exp)}`;
}

/** URL absolue (APP_URL) — pour les services externes (WhatsApp, e-mails). */
export function createAbsoluteSignedUrl(bucket: Bucket, key: string, expiresInSec = 3600): string {
  return `${env.appUrl}${createSignedUrl(bucket, key, expiresInSec)}`;
}

export function verifySignedUrl(
  bucket: string,
  key: string,
  exp: string | null,
  sig: string | null,
) {
  if (!exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(sign(bucket, key, expNum));
  const provided = Buffer.from(sig);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
