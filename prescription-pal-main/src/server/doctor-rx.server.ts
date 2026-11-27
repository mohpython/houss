/**
 * E-ordonnance médecin — primitives serveur partagées.
 *
 * La signature électronique est un HMAC-SHA256 calculé sur une projection
 * canonique de l'ordonnance (identité du médecin, patient, diagnostic, lignes,
 * date de signature, version). Toute modification d'un champ postérieure à la
 * signature invalide donc la vérification : c'est volontaire et c'est ce que
 * contrôle la page publique scannée par la pharmacie.
 */
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { env } from "./env.server";

export type RxItemLike = {
  position?: number | null;
  medicine_name: string;
  dosage?: string | null;
  form?: string | null;
  quantity?: string | null;
  posology?: string | null;
  frequency?: string | null;
  duration?: string | null;
  route?: string | null;
  instructions?: string | null;
};

export type RxLike = {
  id: string;
  number: string;
  version: number;
  doctor_id: string;
  doctor_name: string;
  doctor_specialty?: string | null;
  doctor_license?: string | null;
  establishment_name: string;
  patient_id: string;
  patient_name: string;
  patient_birth_date?: Date | string | null;
  patient_sex?: string | null;
  consultation_date: Date | string;
  diagnosis?: string | null;
  reason?: string | null;
  observations?: string | null;
  advice?: string | null;
  signed_at?: Date | string | null;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function dateKey(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    return value.slice(0, 10);
  }
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

export function dateFr(value: Date | string | null | undefined): string {
  const key = dateKey(value);
  if (!key) return "—";
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

export function ageFromBirth(value: Date | string | null | undefined): number | null {
  const key = dateKey(value);
  if (!key) return null;
  const birth = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age--;
  return age >= 0 && age < 130 ? age : null;
}

export function patientCode(userId: string): string {
  return `SAHA-${userId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/** Nom affichable sans double « Dr. Dr. ». */
export function doctorDisplayName(name: string): string {
  const trimmed = name.trim();
  return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
}

/** Nom stocké sans civilité (l'interface ajoute « Dr. »). */
export function doctorStoredName(name: string): string {
  return name.trim().replace(/^dr\.?\s+/i, "");
}

export function newPrescriptionNumber(): string {
  const now = new Date();
  const ymd = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  return `ORD-${ymd}-${randomInt(1000, 10000)}`;
}

export function newVerificationToken(): string {
  return randomBytes(24).toString("base64url");
}

export function verificationUrl(token: string): string {
  return `${env.appUrl}/medecin/verifier/${token}`;
}

export function canonicalPayload(
  rx: RxLike,
  items: RxItemLike[],
  signedAt: Date | string,
): string {
  return JSON.stringify({
    v: 1,
    id: rx.id,
    number: rx.number,
    version: rx.version,
    doctor: {
      id: rx.doctor_id,
      name: rx.doctor_name,
      specialty: rx.doctor_specialty ?? null,
      license: rx.doctor_license ?? null,
      establishment: rx.establishment_name,
    },
    patient: {
      id: rx.patient_id,
      name: rx.patient_name,
      birth_date: dateKey(rx.patient_birth_date) || null,
      sex: rx.patient_sex ?? null,
    },
    consultation_date: dateKey(rx.consultation_date),
    diagnosis: rx.diagnosis ?? null,
    reason: rx.reason ?? null,
    observations: rx.observations ?? null,
    advice: rx.advice ?? null,
    items: items.map((item, index) => ({
      position: item.position ?? index,
      medicine_name: item.medicine_name,
      dosage: item.dosage ?? null,
      form: item.form ?? null,
      quantity: item.quantity ?? null,
      posology: item.posology ?? null,
      frequency: item.frequency ?? null,
      duration: item.duration ?? null,
      route: item.route ?? null,
      instructions: item.instructions ?? null,
    })),
    signed_at: signedAt instanceof Date ? signedAt.toISOString() : new Date(signedAt).toISOString(),
  });
}

export function signCanonical(payload: string): string {
  return createHmac("sha256", env.appSecret).update(payload).digest("hex");
}

export function signPrescription(rx: RxLike, items: RxItemLike[], signedAt: Date) {
  const payload = canonicalPayload(rx, items, signedAt);
  return { payload, hash: signCanonical(payload) };
}

export function verifyPrescriptionSignature(
  rx: RxLike,
  items: RxItemLike[],
  signature: string | null | undefined,
): { valid: boolean; expected: string | null } {
  if (!signature || !rx.signed_at) return { valid: false, expected: null };
  const payload = canonicalPayload(rx, items, rx.signed_at);
  const expected = signCanonical(payload);
  let valid = false;
  try {
    valid =
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    valid = false;
  }
  return { valid, expected };
}

export function sha256Hex(data: Uint8Array | Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export async function qrDataUrl(token: string): Promise<string> {
  return QRCode.toDataURL(verificationUrl(token), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 420,
    color: { dark: "#064e3b", light: "#ffffff" },
  });
}

export async function qrPng(token: string): Promise<Buffer> {
  return QRCode.toBuffer(verificationUrl(token), {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 420,
    color: { dark: "#064e3b", light: "#ffffff" },
  });
}
