/**
 * Detection du format reel d'un fichier a partir de ses octets.
 *
 * Le type MIME **declare** par le client n'est pas une source de verite : le
 * paquet `http` de Dart envoie `application/octet-stream` quand il ne parvient
 * pas a deduire le type de l'extension du fichier, ce qui arrive souvent avec
 * les photos prises par `image_picker` (nom de fichier temporaire sans
 * extension). Le serveur ne doit donc pas croire le client sur parole : on lit
 * les premiers octets du fichier.
 */

/** Formats acceptes pour une ordonnance. */
export const PRESCRIPTION_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

export type PrescriptionMime = (typeof PRESCRIPTION_MIME)[number];

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = start; i < start + length; i++) out += String.fromCharCode(bytes[i] ?? 0);
  return out;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

const PDF: readonly number[] = [0x25, 0x50, 0x44, 0x46]; // %PDF
const PNG: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG: readonly number[] = [0xff, 0xd8, 0xff];
const RIFF: readonly number[] = [0x52, 0x49, 0x46, 0x46]; // RIFF
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heif", "mif1", "msf1"]);

/** Devine le type MIME d'apres les octets, ou `null` si le format est inconnu. */
export function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, PNG)) return "image/png";
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, PDF)) return "application/pdf";
  if (startsWith(bytes, RIFF) && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  // HEIC / HEIF : boite ISO-BMFF `ftyp` suivie d'une marque.
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    if (HEIC_BRANDS.has(brand)) return brand.startsWith("hei") ? "image/heic" : "image/heif";
  }
  return null;
}

/** Retire les parametres d'un type MIME : `image/jpeg; charset=x` devient `image/jpeg`. */
export function normalizeMime(mime: string | null | undefined): string {
  const head = (mime ?? "").split(";")[0] ?? "";
  return head.trim().toLowerCase();
}

export function isPrescriptionMime(mime: string): boolean {
  return (PRESCRIPTION_MIME as readonly string[]).includes(mime);
}
