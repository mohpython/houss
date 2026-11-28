/**
 * Génération du PDF officiel d'une e-ordonnance (A4).
 *
 * Mise en page « papier ordonnance » : feuille claire, encre noire, lignes
 * horizontales sur lesquelles sont posées les médicaments, signature manuscrite
 * et cachet. Le QR et l'empreinte HMAC restent discrets mais vérifiables.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  ageFromBirth,
  dateFr,
  patientCode,
  type RxItemLike,
  type RxLike,
} from "./doctor-rx.server";

const A4 = { width: 595.28, height: 841.89 };
const M = 48;
const CONTENT = A4.width - M * 2;

const COLORS = {
  ink: rgb(0.09, 0.1, 0.11),
  muted: rgb(0.38, 0.4, 0.41),
  rule: rgb(0.79, 0.83, 0.84),
  ruleStrong: rgb(0.58, 0.64, 0.65),
  accent: rgb(0.04, 0.34, 0.28),
  accentLight: rgb(0.95, 0.985, 0.97),
  paper: rgb(0.997, 0.995, 0.988),
  white: rgb(1, 1, 1),
};

function pdfSafe(input: string | null | undefined): string {
  return String(input ?? "")
    .replace(/[ɛƐ]/g, "e")
    .replace(/[ɔƆ]/g, "o")
    .replace(/[ɲƝ]/g, "ny")
    .replace(/[ŋŊ]/g, "ng")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\u2026/g, "...")
    .replace(/[^\x00-\xFF]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = pdfSafe(text).trim();
  if (!clean) return [];
  const out: string[] = [];
  for (const paragraph of clean.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) out.push(line);
        if (font.widthOfTextAtSize(word, size) > maxWidth) {
          let rest = word;
          while (font.widthOfTextAtSize(rest, size) > maxWidth) {
            let cut = rest.length - 1;
            while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
            out.push(rest.slice(0, cut));
            rest = rest.slice(cut);
          }
          line = rest;
        } else {
          line = word;
        }
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function put(
  page: PDFPage,
  value: string | null | undefined,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = COLORS.ink,
) {
  const text = pdfSafe(value);
  if (!text) return;
  page.drawText(text, { x, y, size, font, color });
}

function putRight(
  page: PDFPage,
  value: string | null | undefined,
  right: number,
  y: number,
  font: PDFFont,
  size: number,
  color = COLORS.ink,
) {
  const text = pdfSafe(value);
  if (!text) return;
  page.drawText(text, {
    x: right - font.widthOfTextAtSize(text, size),
    y,
    size,
    font,
    color,
  });
}

function rule(page: PDFPage, x: number, y: number, width: number, strong = false) {
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness: strong ? 0.9 : 0.45,
    color: strong ? COLORS.ruleStrong : COLORS.rule,
  });
}

export type PrescriptionPdfInput = {
  rx: RxLike & {
    number: string;
    status: string;
    doctor_name: string;
    doctor_specialty?: string | null;
    doctor_license?: string | null;
    establishment_name: string;
    establishment_address?: string | null;
    establishment_phone?: string | null;
    patient_name: string;
    patient_phone?: string | null;
    patient_email?: string | null;
    patient_birth_date?: Date | string | null;
    patient_sex?: string | null;
    patient_id: string;
    consultation_date: Date | string;
    diagnosis?: string | null;
    reason?: string | null;
    observations?: string | null;
    advice?: string | null;
    signed_at?: Date | string | null;
    identity_verified?: boolean;
    verification_token: string;
    signature_hash?: string | null;
    version: number;
  };
  items: RxItemLike[];
  qrPng: Uint8Array;
  verifyUrl: string;
};

export async function generatePrescriptionPdf(input: PrescriptionPdfInput): Promise<Uint8Array> {
  const { rx, items, qrPng, verifyUrl } = input;
  const doc = await PDFDocument.create();
  doc.setTitle(`Ordonnance ${rx.number} — ${rx.patient_name}`);
  doc.setAuthor(`SAHA Santé — ${rx.doctor_name}`);
  doc.setSubject("Ordonnance électronique signée");
  doc.setCreator("SAHA Santé e-Ordonnance");
  doc.setProducer("SAHA Santé");

  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const qrImage = await doc.embedPng(qrPng);

  const doctorName = `Dr. ${rx.doctor_name.replace(/^dr\.?\s+/i, "")}`;
  const issued = dateFr(rx.consultation_date);

  let page = doc.addPage([A4.width, A4.height]);
  let y = 0;

  const drawBackground = (p: PDFPage) => {
    p.drawRectangle({ x: 0, y: 0, width: A4.width, height: A4.height, color: COLORS.paper });
    p.drawRectangle({ x: 0, y: A4.height - 5, width: A4.width, height: 5, color: COLORS.accent });
  };

  const drawHeader = (p: PDFPage, continued: boolean) => {
    drawBackground(p);
    // Le titre est centré manuellement (pdf-lib ne gère pas textAlign).
    const title = continued ? "ORDONNANCE (SUITE)" : "ORDONNANCE";
    const titleSize = continued ? 12 : 17;
    p.drawText(title, {
      x: (A4.width - serifBold.widthOfTextAtSize(title, titleSize)) / 2,
      y: A4.height - 48,
      size: titleSize,
      font: serifBold,
      color: COLORS.ink,
    });
    const subtitle = `SAHA Santé  ·  Bamako, Mali  ·  ${rx.number}`;
    p.drawText(pdfSafe(subtitle), {
      x: (A4.width - sans.widthOfTextAtSize(pdfSafe(subtitle), 7.6)) / 2,
      y: A4.height - 64,
      size: 7.6,
      font: sans,
      color: COLORS.muted,
    });
    rule(p, M, A4.height - 78, CONTENT, true);
    return A4.height - 102;
  };

  const drawFooter = (p: PDFPage, pageIndex: number, total: number) => {
    rule(p, M, 52, CONTENT);
    put(
      p,
      "Document signe electroniquement - toute modification invalide la signature.",
      M,
      38,
      sans,
      6.4,
      COLORS.muted,
    );
    put(p, verifyUrl, M, 28, sans, 6.2, COLORS.accent);
    putRight(p, `Page ${pageIndex + 1}/${total}`, A4.width - M, 38, sans, 6.4, COLORS.muted);
  };

  const newPage = () => {
    page = doc.addPage([A4.width, A4.height]);
    y = drawHeader(page, true);
  };

  const ensure = (height: number) => {
    if (y - height < 84) newPage();
  };

  /** Écrit un texte sur des lignes ruled, comme sur une feuille manuscrite. */
  const ruledLines = (
    label: string,
    value: string | null | undefined,
    font: PDFFont,
    size: number,
    lineHeight = 15,
    minLines = 0,
  ) => {
    const lines = wrap(value ?? "", font, size, CONTENT - 16);
    const count = Math.max(lines.length, minLines);
    if (!count) return y;
    ensure(count * lineHeight + 14);
    put(page, label, M, y, sansBold, 7, COLORS.accent);
    y -= 11;
    for (let i = 0; i < count; i++) {
      const baseline = y - (i + 1) * lineHeight + 4;
      rule(page, M, baseline, CONTENT);
      if (lines[i]) put(page, lines[i], M + 6, baseline + 2, font, size, COLORS.ink);
    }
    y -= count * lineHeight + 8;
    return y;
  };

  y = drawHeader(page, false);

  // --- Identité du praticien -------------------------------------------------
  put(page, doctorName, M, y, serifBold, 13, COLORS.ink);
  y -= 15;
  if (rx.doctor_specialty) {
    put(page, rx.doctor_specialty, M, y, serifItalic, 9, COLORS.accent);
    y -= 12;
  }
  const proLine = [
    rx.doctor_license ? `N° professionnel : ${rx.doctor_license}` : "",
    rx.establishment_phone ? `Tél. : ${rx.establishment_phone}` : "",
  ]
    .filter(Boolean)
    .join("   ·   ");
  put(page, proLine, M, y, sans, 7.6, COLORS.muted);
  y -= 11;
  put(page, rx.establishment_name, M, y, serifBold, 9, COLORS.ink);
  y -= 11;
  put(page, rx.establishment_address, M, y, sans, 7.4, COLORS.muted);
  y -= 9;

  putRight(page, `DATE : ${issued}`, A4.width - M, A4.height - 102, sansBold, 7.6, COLORS.accent);
  putRight(page, `N° ${rx.number}`, A4.width - M, A4.height - 115, serifBold, 9, COLORS.ink);
  putRight(page, `Version ${rx.version}`, A4.width - M, A4.height - 127, sans, 7, COLORS.muted);

  y -= 10;
  rule(page, M, y, CONTENT, true);
  y -= 20;

  // --- Patient --------------------------------------------------------------
  ensure(76);
  put(page, "PATIENT", M, y, sansBold, 7, COLORS.accent);
  y -= 15;
  put(page, rx.patient_name, M, y, serifBold, 12, COLORS.ink);
  const age = ageFromBirth(rx.patient_birth_date);
  const sex = rx.patient_sex === "F" ? "Féminin" : rx.patient_sex === "M" ? "Masculin" : rx.patient_sex;
  const meta = [age != null ? `${age} ans` : "", sex, rx.patient_phone ? `Tél. ${rx.patient_phone}` : ""]
    .filter(Boolean)
    .join("   ·   ");
  put(page, meta, M + 210, y + 1, sans, 7.6, COLORS.muted);
  y -= 10;
  rule(page, M, y + 7, CONTENT);
  put(page, `Identifiant SAHA : ${patientCode(rx.patient_id)}`, M, y - 8, sans, 7.4, COLORS.muted);
  put(
    page,
    rx.identity_verified ? "Identité vérifiée" : "Identité à vérifier",
    A4.width - M - sans.widthOfTextAtSize(
      rx.identity_verified ? "Identité vérifiée" : "Identité à vérifier",
      7.4,
    ),
    y - 8,
    sans,
    7.4,
    rx.identity_verified ? COLORS.accent : COLORS.muted,
  );
  y -= 24;

  // --- Diagnostic / motif ---------------------------------------------------
  const diagnosis = [rx.diagnosis?.trim(), rx.reason?.trim()].filter(Boolean).join(" — ");
  if (diagnosis) {
    ruledLines("DIAGNOSTIC / MOTIF", diagnosis, serif, 9.5, 16, 2);
  }

  // --- Prescription sur lignes ----------------------------------------------
  ensure(40);
  put(page, "PRESCRIPTION", M, y, sansBold, 8, COLORS.accent);
  y -= 10;
  rule(page, M, y, CONTENT, true);
  y -= 14;

  if (!items.length) {
    for (let i = 0; i < 4; i++) {
      ensure(18);
      rule(page, M, y - 14, CONTENT);
      y -= 22;
    }
  }

  items.forEach((item, index) => {
    const first = [item.medicine_name, item.dosage].filter(Boolean).join(" — ");
    const headLines = wrap(`${index + 1}. ${first}`, serifBold, 9.6, CONTENT - 16);
    const detail = [
      item.form,
      item.instructions,
      item.posology,
      item.frequency,
      item.route,
    ]
      .filter(Boolean)
      .join(" · ");
    const detailLines = wrap(detail, serif, 8.4, CONTENT - 32);
    const tail = [
      item.duration ? `Durée : ${item.duration}` : "",
      item.quantity ? `Quantité : ${item.quantity}` : "",
    ]
      .filter(Boolean)
      .join("   ·   ");
    const tailLines = tail ? wrap(tail, serifItalic, 8, CONTENT - 32) : [];
    const lines = [...headLines, ...detailLines, ...tailLines];
    const lineHeight = 16;
    const height = lines.length * lineHeight + 8;
    ensure(height + 4);

    for (let i = 0; i < lines.length; i++) {
      const baseline = y - (i + 1) * lineHeight + 5;
      rule(page, M, baseline, CONTENT);
      const isHead = i < headLines.length;
      put(page, lines[i], M + (isHead ? 6 : 18), baseline + 2, isHead ? serifBold : i >= headLines.length + detailLines.length ? serifItalic : serif, isHead ? 9.6 : 8.4, COLORS.ink);
    }
    y -= height;
  });

  y -= 8;

  // --- Conseils / observations ----------------------------------------------
  if (rx.advice?.trim()) ruledLines("CONSEILS", rx.advice, serif, 9, 16, 2);
  if (rx.observations?.trim()) {
    ruledLines("OBSERVATIONS", rx.observations, serif, 8.6, 16, 2);
  }

  // --- Cachet, signature et QR ----------------------------------------------
  const signatureH = 132;
  ensure(signatureH + 10);
  const blockTop = y;
  rule(page, M, blockTop, CONTENT, true);

  // Cachet discrêt.
  const stampX = M + 40;
  const stampY = blockTop - 62;
  page.drawCircle({ x: stampX, y: stampY, size: 31, borderColor: COLORS.accent, borderWidth: 1 });
  page.drawCircle({ x: stampX, y: stampY, size: 27, borderColor: COLORS.accent, borderWidth: 0.4 });
  put(page, "SAHA SANTE", stampX - sansBold.widthOfTextAtSize("SAHA SANTE", 6) / 2, stampY + 8, sansBold, 6, COLORS.accent);
  put(page, "CACHET", stampX - sansBold.widthOfTextAtSize("CACHET", 5.4) / 2, stampY - 1, sansBold, 5.4, COLORS.accent);
  put(page, pdfSafe(rx.doctor_name).slice(0, 18), stampX - sans.widthOfTextAtSize(pdfSafe(rx.doctor_name).slice(0, 18), 5) / 2, stampY - 10, sans, 5, COLORS.muted);

  // Signature manuscrite.
  const signRight = A4.width - M;
  const signWidth = 230;
  const signX = signRight - signWidth;
  putRight(page, `Bamako, le ${issued}`, signRight, blockTop - 18, serifItalic, 8, COLORS.muted);
  put(page, doctorName, signX, blockTop - 50, serifItalic, 16, COLORS.ink);
  rule(page, signX, blockTop - 57, signWidth, true);
  put(page, "Signature du praticien", signX, blockTop - 70, sans, 7, COLORS.muted);
  put(page, `Signe le ${dateFr(rx.signed_at)}`, signX, blockTop - 84, sans, 6.8, COLORS.muted);

  // QR de vérification, petit et en bas à gauche.
  const qrSize = 58;
  const qrX = M + 96;
  const qrY = blockTop - 92 - qrSize;
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  put(page, "Scanner pour verifier", qrX - 8, qrY - 11, sans, 6.4, COLORS.muted);
  const hashShort = rx.signature_hash ? `${rx.signature_hash.slice(0, 20)}...` : "non signee";
  put(page, `Empreinte : ${hashShort}`, M + 168, qrY + 26, sans, 6.2, COLORS.muted);
  put(page, "Authentification SAHA Santé", M + 168, qrY + 15, serifItalic, 7, COLORS.accent);
  if (rx.version > 1) {
    put(page, `Avenant - version ${rx.version}`, M + 168, qrY + 4, sansBold, 6.2, COLORS.accent);
  }

  y = blockTop - signatureH - 6;

  // --- Filigrane selon le statut --------------------------------------------
  const watermark =
    rx.status === "draft"
      ? "BROUILLON"
      : rx.status === "cancelled"
        ? "ANNULEE"
        : rx.status === "amended"
          ? "AVENANT"
          : null;
  if (watermark) {
    for (const p of doc.getPages()) {
      p.drawText(watermark, {
        x: 110,
        y: 330,
        size: 76,
        font: serifBold,
        color: COLORS.rule,
        opacity: 0.18,
        rotate: -35,
      });
    }
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => drawFooter(p, i, pages.length));

  return doc.save();
}
