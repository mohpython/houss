/**
 * Génération du PDF officiel d'une e-ordonnance (A4).
 *
 * Le document reprend la mise en page de l'aperçu web : en-tête SAHA,
 * identité du médecin et de l'établissement, patient, diagnostic, tableau des
 * médicaments, conseils, cachet numérique, signature et QR de vérification.
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  ageFromBirth,
  dateFr,
  patientCode,
  type RxItemLike,
  type RxLike,
} from "./doctor-rx.server";

const A4 = { width: 595.28, height: 841.89 };
const M = 44;

const COLORS = {
  ink: rgb(0.055, 0.129, 0.118),
  muted: rgb(0.36, 0.45, 0.43),
  line: rgb(0.84, 0.9, 0.88),
  emerald: rgb(0.0, 0.62, 0.47),
  emeraldDark: rgb(0.02, 0.3, 0.24),
  emeraldLight: rgb(0.93, 0.98, 0.96),
  white: rgb(1, 1, 1),
  paper: rgb(0.985, 0.995, 0.992),
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
          // Very long token: hard split.
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

function centered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = COLORS.ink) {
  const clean = pdfSafe(text);
  const width = font.widthOfTextAtSize(clean, size);
  page.drawText(clean, { x: (A4.width - width) / 2, y, size, font, color });
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

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const serifItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const qrImage = await doc.embedPng(qrPng);

  let page = doc.addPage([A4.width, A4.height]);
  let y = 0;

  const drawHeader = (p: PDFPage, compact = false) => {
    const h = compact ? 54 : 112;
    p.drawRectangle({
      x: 0,
      y: A4.height - h,
      width: A4.width,
      height: h,
      color: rgb(0.02, 0.16, 0.13),
    });
    p.drawRectangle({
      x: 0,
      y: A4.height - h,
      width: 7,
      height: h,
      color: COLORS.emerald,
    });
    // Logo : croix médicale.
    const lx = M;
    const ly = A4.height - (compact ? 40 : 80);
    p.drawRectangle({
      x: lx,
      y: ly - 10,
      width: 30,
      height: 30,
      color: COLORS.white,
      borderColor: COLORS.emerald,
      borderWidth: 1.2,
    });
    p.drawRectangle({ x: lx + 12, y: ly - 4, width: 6, height: 18, color: COLORS.emerald });
    p.drawRectangle({ x: lx + 6, y: ly + 2, width: 18, height: 6, color: COLORS.emerald });

    if (compact) {
      p.drawText("SAHA Santé — e-Ordonnance", {
        x: lx + 40,
        y: ly + 1,
        size: 11,
        font: bold,
        color: COLORS.white,
      });
      p.drawText(pdfSafe(rx.number), {
        x: A4.width - M - bold.widthOfTextAtSize(pdfSafe(rx.number), 9),
        y: ly + 3,
        size: 9,
        font: bold,
        color: COLORS.emerald,
      });
      return;
    }

    p.drawText("SAHA Santé", {
      x: lx + 40,
      y: ly + 14,
      size: 20,
      font: bold,
      color: COLORS.white,
    });
    p.drawText("e-Ordonnance", {
      x: lx + 40,
      y: ly + 1,
      size: 9.5,
      font: bold,
      color: COLORS.emerald,
    });
    p.drawText("Votre santé, notre priorité", {
      x: lx + 40,
      y: ly - 10,
      size: 7,
      font: regular,
      color: rgb(0.68, 0.82, 0.78),
    });

    const right = A4.width - M;
    const title = "ORDONNANCE ÉLECTRONIQUE";
    p.drawText(title, {
      x: right - bold.widthOfTextAtSize(title, 8.5),
      y: A4.height - 38,
      size: 8.5,
      font: bold,
      color: rgb(0.72, 0.9, 0.84),
    });
    p.drawText(pdfSafe(rx.number), {
      x: right - bold.widthOfTextAtSize(pdfSafe(rx.number), 12),
      y: A4.height - 55,
      size: 12,
      font: bold,
      color: COLORS.emerald,
    });
    p.drawText(`Version ${rx.version}`, {
      x: right - regular.widthOfTextAtSize(`Version ${rx.version}`, 7.5),
      y: A4.height - 68,
      size: 7.5,
      font: regular,
      color: rgb(0.68, 0.82, 0.78),
    });
    p.drawText(`Émise le ${dateFr(rx.consultation_date)}`, {
      x: right - regular.widthOfTextAtSize(`Émise le ${dateFr(rx.consultation_date)}`, 7.5),
      y: A4.height - 80,
      size: 7.5,
      font: regular,
      color: rgb(0.68, 0.82, 0.78),
    });
  };

  const drawFooter = (p: PDFPage, pageIndex: number, total: number) => {
    p.drawLine({
      start: { x: M, y: 46 },
      end: { x: A4.width - M, y: 46 },
      thickness: 0.6,
      color: COLORS.line,
    });
    p.drawText("Document généré électroniquement — toute modification invalide la signature.", {
      x: M,
      y: 33,
      size: 6.6,
      font: regular,
      color: COLORS.muted,
    });
    p.drawText(pdfSafe(verifyUrl), {
      x: M,
      y: 24,
      size: 6.4,
      font: regular,
      color: COLORS.emeraldDark,
    });
    const right = `Page ${pageIndex + 1}/${total}`;
    p.drawText(right, {
      x: A4.width - M - regular.widthOfTextAtSize(right, 6.6),
      y: 33,
      size: 6.6,
      font: regular,
      color: COLORS.muted,
    });
  };

  const newPage = () => {
    page = doc.addPage([A4.width, A4.height]);
    drawHeader(page, true);
    y = A4.height - 82;
    return page;
  };

  const ensure = (height: number) => {
    if (y - height < 78) newPage();
  };

  const drawWrapped = (
    text: string,
    x: number,
    top: number,
    maxWidth: number,
    font: PDFFont,
    size: number,
    color = COLORS.ink,
    lineHeight = size * 1.35,
  ) => {
    const lines = wrap(text, font, size, maxWidth);
    lines.forEach((line, i) => {
      page.drawText(line, { x, y: top - i * lineHeight, size, font, color });
    });
    return lines.length * lineHeight;
  };

  drawHeader(page);
  y = A4.height - 132;

  // --- Identité du médecin / établissement ---------------------------------
  page.drawText(pdfSafe(`Dr. ${rx.doctor_name.replace(/^dr\.?\s+/i, "")}`), {
    x: M,
    y,
    size: 14,
    font: bold,
    color: COLORS.ink,
  });
  y -= 15;
  if (rx.doctor_specialty) {
    page.drawText(pdfSafe(rx.doctor_specialty), {
      x: M,
      y,
      size: 8.5,
      font: regular,
      color: COLORS.emeraldDark,
    });
    y -= 11;
  }
  const licenseLine = [
    rx.doctor_license ? `N° professionnel : ${rx.doctor_license}` : "",
    rx.establishment_phone ? `Tél. : ${rx.establishment_phone}` : "",
  ]
    .filter(Boolean)
    .join("   •   ");
  if (licenseLine) {
    page.drawText(pdfSafe(licenseLine), {
      x: M,
      y,
      size: 7.5,
      font: regular,
      color: COLORS.muted,
    });
    y -= 10;
  }
  page.drawText(pdfSafe(rx.establishment_name), {
    x: M,
    y,
    size: 9,
    font: bold,
    color: COLORS.emeraldDark,
  });
  y -= 11;
  if (rx.establishment_address) {
    page.drawText(pdfSafe(rx.establishment_address), {
      x: M,
      y,
      size: 7.5,
      font: regular,
      color: COLORS.muted,
    });
    y -= 10;
  }

  y -= 8;

  // --- Patient --------------------------------------------------------------
  const patientBoxHeight = 76;
  ensure(patientBoxHeight + 12);
  page.drawRectangle({
    x: M,
    y: y - patientBoxHeight,
    width: A4.width - M * 2,
    height: patientBoxHeight,
    color: COLORS.emeraldLight,
    borderColor: rgb(0.78, 0.9, 0.86),
    borderWidth: 0.7,
  });
  page.drawRectangle({
    x: M,
    y: y - patientBoxHeight,
    width: 4,
    height: patientBoxHeight,
    color: COLORS.emerald,
  });
  page.drawText("PATIENT", {
    x: M + 14,
    y: y - 17,
    size: 7.2,
    font: bold,
    color: COLORS.emeraldDark,
  });
  page.drawText(pdfSafe(rx.patient_name), {
    x: M + 14,
    y: y - 32,
    size: 12,
    font: bold,
    color: COLORS.ink,
  });
  const age = ageFromBirth(rx.patient_birth_date);
  const patientMeta = [
    age != null ? `${age} ans` : "",
    rx.patient_sex === "F" ? "Féminin" : rx.patient_sex === "M" ? "Masculin" : rx.patient_sex ?? "",
    rx.patient_phone ? `Tél. ${rx.patient_phone}` : "",
  ]
    .filter(Boolean)
    .join("   •   ");
  page.drawText(pdfSafe(patientMeta), {
    x: M + 14,
    y: y - 46,
    size: 7.8,
    font: regular,
    color: COLORS.muted,
  });
  page.drawText(pdfSafe(`Identifiant SAHA : ${patientCode(rx.patient_id)}`), {
    x: M + 14,
    y: y - 58,
    size: 7.2,
    font: regular,
    color: COLORS.muted,
  });

  const rightX = A4.width - M - 14;
  const dateLabel = "DATE DE CONSULTATION";
  page.drawText(dateLabel, {
    x: rightX - bold.widthOfTextAtSize(dateLabel, 6.8),
    y: y - 17,
    size: 6.8,
    font: bold,
    color: COLORS.emeraldDark,
  });
  const dateValue = dateFr(rx.consultation_date);
  page.drawText(dateValue, {
    x: rightX - bold.widthOfTextAtSize(dateValue, 10),
    y: y - 32,
    size: 10,
    font: bold,
    color: COLORS.ink,
  });
  const verifiedLabel = rx.identity_verified ? "IDENTITÉ VÉRIFIÉE" : "IDENTITÉ À VÉRIFIER";
  const vw = bold.widthOfTextAtSize(verifiedLabel, 6.4);
  page.drawRectangle({
    x: rightX - vw - 10,
    y: y - 52,
    width: vw + 10,
    height: 13,
    color: rx.identity_verified ? rgb(0.88, 0.97, 0.93) : rgb(1, 0.95, 0.86),
    borderColor: rx.identity_verified ? COLORS.emerald : rgb(0.85, 0.6, 0.1),
    borderWidth: 0.5,
  });
  page.drawText(verifiedLabel, {
    x: rightX - vw - 5,
    y: y - 48,
    size: 6.4,
    font: bold,
    color: rx.identity_verified ? COLORS.emeraldDark : rgb(0.55, 0.38, 0.03),
  });

  y -= patientBoxHeight + 18;

  // --- Diagnostic / motif ---------------------------------------------------
  const diagnosis = rx.diagnosis?.trim();
  const reason = rx.reason?.trim();
  if (diagnosis || reason) {
    ensure(52);
    let cursor = y;
    if (diagnosis) {
      page.drawText("DIAGNOSTIC", {
        x: M,
        y: cursor,
        size: 6.8,
        font: bold,
        color: COLORS.emeraldDark,
      });
      cursor -= 12;
      cursor -= drawWrapped(diagnosis, M, cursor, 300, bold, 10, COLORS.ink);
      cursor -= 4;
    }
    if (reason) {
      page.drawText("MOTIF DE CONSULTATION", {
        x: M,
        y: cursor,
        size: 6.8,
        font: bold,
        color: COLORS.emeraldDark,
      });
      cursor -= 11;
      cursor -= drawWrapped(reason, M, cursor, 300, regular, 8, COLORS.muted);
    }
    y = cursor - 10;
  }

  // --- Tableau des médicaments ---------------------------------------------
  const col = {
    name: M,
    nameW: 240,
    posology: M + 248,
    posologyW: 140,
    duration: M + 394,
    durationW: 58,
    quantity: M + 456,
    quantityW: 51,
  };
  const headerH = 22;

  const drawTableHeader = () => {
    ensure(headerH + 4);
    page.drawRectangle({
      x: M,
      y: y - headerH,
      width: A4.width - M * 2,
      height: headerH,
      color: COLORS.emeraldDark,
    });
    const labels: Array<[string, number]> = [
      ["MÉDICAMENT", col.name + 8],
      ["POSOLOGIE", col.posology],
      ["DURÉE", col.duration],
      ["QTÉ", col.quantity],
    ];
    for (const [label, x] of labels) {
      page.drawText(label, {
        x,
        y: y - 14,
        size: 6.6,
        font: bold,
        color: COLORS.white,
      });
    }
    y -= headerH;
  };

  drawTableHeader();

  items.forEach((item, index) => {
    const nameLines = wrap(
      [item.medicine_name, item.dosage].filter(Boolean).join(" — "),
      bold,
      8.6,
      col.nameW - 12,
    );
    const formLine = [item.form, item.instructions].filter(Boolean).join(" • ");
    const formLines = formLine ? wrap(formLine, regular, 6.9, col.nameW - 12) : [];
    const posologyLines = wrap(
      [item.posology, item.frequency, item.route].filter(Boolean).join("\n"),
      regular,
      7.4,
      col.posologyW - 4,
    );
    const durationLines = wrap(item.duration ?? "—", regular, 7.2, col.durationW - 4);
    const quantityLines = wrap(item.quantity ?? "—", regular, 7.2, col.quantityW - 2);
    const rowLines = Math.max(
      nameLines.length + formLines.length,
      posologyLines.length,
      durationLines.length,
      quantityLines.length,
      1,
    );
    const rowH = Math.max(28, rowLines * 9.2 + 12);
    ensure(rowH + 2);
    if (y === A4.height - 82 - headerH) drawTableHeader();
    page.drawRectangle({
      x: M,
      y: y - rowH,
      width: A4.width - M * 2,
      height: rowH,
      color: index % 2 === 0 ? COLORS.white : rgb(0.975, 0.988, 0.984),
      borderColor: COLORS.line,
      borderWidth: 0.4,
    });
    let ty = y - 12;
    nameLines.forEach((line, i) => {
      page.drawText(line, {
        x: col.name + 8,
        y: ty - i * 9.4,
        size: 8.6,
        font: bold,
        color: COLORS.ink,
      });
    });
    ty -= nameLines.length * 9.4;
    formLines.forEach((line, i) => {
      page.drawText(line, {
        x: col.name + 8,
        y: ty - i * 8.2,
        size: 6.9,
        font: regular,
        color: COLORS.muted,
      });
    });
    posologyLines.forEach((line, i) => {
      page.drawText(line, {
        x: col.posology,
        y: y - 12 - i * 9,
        size: 7.4,
        font: regular,
        color: COLORS.ink,
      });
    });
    durationLines.forEach((line, i) => {
      page.drawText(line, {
        x: col.duration,
        y: y - 12 - i * 9,
        size: 7.2,
        font: regular,
        color: COLORS.muted,
      });
    });
    quantityLines.forEach((line, i) => {
      page.drawText(line, {
        x: col.quantity,
        y: y - 12 - i * 9,
        size: 7.2,
        font: regular,
        color: COLORS.muted,
      });
    });
    y -= rowH;
  });

  y -= 16;

  // --- Conseils / observations ---------------------------------------------
  if (rx.advice?.trim() || rx.observations?.trim()) {
    const blocks = [
      { title: "CONSEILS ET OBSERVATIONS", value: rx.advice?.trim() },
      { title: "OBSERVATIONS MÉDICALES", value: rx.observations?.trim() },
    ].filter((b) => b.value);
    for (const block of blocks) {
      const lines = wrap(block.value!, regular, 8, A4.width - M * 2 - 24);
      const h = 24 + lines.length * 10.5;
      ensure(h + 10);
      page.drawRectangle({
        x: M,
        y: y - h,
        width: A4.width - M * 2,
        height: h,
        color: COLORS.paper,
        borderColor: COLORS.line,
        borderWidth: 0.5,
      });
      page.drawText(block.title, {
        x: M + 10,
        y: y - 13,
        size: 6.6,
        font: bold,
        color: COLORS.emeraldDark,
      });
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: M + 10,
          y: y - 25 - i * 10.5,
          size: 8,
          font: regular,
          color: COLORS.ink,
        });
      });
      y -= h + 10;
    }
  }

  // --- Signature / cachet / QR ---------------------------------------------
  const signatureH = 150;
  ensure(signatureH + 10);
  const blockTop = y;
  page.drawRectangle({
    x: M,
    y: blockTop - signatureH,
    width: A4.width - M * 2,
    height: signatureH,
    color: rgb(0.97, 0.995, 0.985),
    borderColor: rgb(0.76, 0.9, 0.84),
    borderWidth: 0.8,
  });

  // Cachet numérique (cercle double).
  const stampX = M + 80;
  const stampY = blockTop - 76;
  page.drawCircle({ x: stampX, y: stampY, size: 39, borderColor: COLORS.emerald, borderWidth: 1.2 });
  page.drawCircle({ x: stampX, y: stampY, size: 35, borderColor: COLORS.emerald, borderWidth: 0.5 });
  centered(
    { drawText: (t: string, o: { x: number; y: number; size: number; font: PDFFont; color: typeof COLORS.ink }) => page.drawText(t, o) } as unknown as PDFPage,
    "CACHET",
    stampY + 10,
    bold,
    6.4,
    COLORS.emeraldDark,
  );
  // Le centrage ci-dessus est volontairement simple : le cachet est un élément
  // graphique, les textes sont positionnés à la main pour rester dans le cercle.
  page.drawText("NUMÉRIQUE", {
    x: stampX - bold.widthOfTextAtSize("NUMÉRIQUE", 5.6) / 2,
    y: stampY + 2,
    size: 5.6,
    font: bold,
    color: COLORS.emeraldDark,
  });
  page.drawText(pdfSafe(rx.establishment_name).slice(0, 26), {
    x: stampX - regular.widthOfTextAtSize(pdfSafe(rx.establishment_name).slice(0, 26), 4.8) / 2,
    y: stampY - 9,
    size: 4.8,
    font: regular,
    color: COLORS.muted,
  });
  page.drawText("Bamako • Mali", {
    x: stampX - regular.widthOfTextAtSize("Bamako • Mali", 4.8) / 2,
    y: stampY - 17,
    size: 4.8,
    font: regular,
    color: COLORS.muted,
  });

  // Signature manuscrite stylisée.
  const sigX = M + 150;
  page.drawText("SIGNATURE ÉLECTRONIQUE", {
    x: sigX,
    y: blockTop - 22,
    size: 6.6,
    font: bold,
    color: COLORS.emeraldDark,
  });
  const signer = `Dr. ${rx.doctor_name.replace(/^dr\.?\s+/i, "")}`;
  page.drawText(pdfSafe(signer), {
    x: sigX,
    y: blockTop - 50,
    size: 17,
    font: serifItalic,
    color: rgb(0.02, 0.28, 0.22),
  });
  page.drawLine({
    start: { x: sigX, y: blockTop - 58 },
    end: { x: sigX + 170, y: blockTop - 58 },
    thickness: 0.6,
    color: COLORS.emerald,
  });
  page.drawText(pdfSafe(`Signé le ${dateFr(rx.signed_at)}`), {
    x: sigX,
    y: blockTop - 70,
    size: 7,
    font: regular,
    color: COLORS.muted,
  });
  const hashShort = rx.signature_hash ? `${rx.signature_hash.slice(0, 24)}…` : "non signée";
  page.drawText(pdfSafe(`Empreinte : ${hashShort}`), {
    x: sigX,
    y: blockTop - 81,
    size: 6.3,
    font: regular,
    color: COLORS.muted,
  });
  page.drawText("Vérifiable en ligne — authentification SAHA Santé", {
    x: sigX,
    y: blockTop - 93,
    size: 6.3,
    font: italic,
    color: COLORS.emeraldDark,
  });

  // QR de vérification.
  const qrSize = 78;
  const qrX = A4.width - M - qrSize - 14;
  const qrY = blockTop - 18 - qrSize;
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  const qrLabel = "Scanner pour vérifier";
  page.drawText(qrLabel, {
    x: qrX + qrSize / 2 - regular.widthOfTextAtSize(qrLabel, 5.8) / 2,
    y: qrY - 9,
    size: 5.8,
    font: regular,
    color: COLORS.muted,
  });

  // Mention de version / avenant.
  if (rx.version > 1) {
    page.drawText(`Avenant — version ${rx.version}`, {
      x: sigX,
      y: blockTop - 108,
      size: 6.2,
      font: bold,
      color: COLORS.emeraldDark,
    });
  }

  y = blockTop - signatureH - 12;

  // --- Filigrane selon le statut -------------------------------------------
  const watermark =
    rx.status === "draft"
      ? "BROUILLON"
      : rx.status === "cancelled"
        ? "ANNULÉE"
        : rx.status === "amended"
          ? "AVENANT"
          : null;
  if (watermark) {
    for (const p of doc.getPages()) {
      p.drawText(watermark, {
        x: 105,
        y: 320,
        size: 78,
        font: bold,
        color: rgb(0.75, 0.82, 0.8),
        opacity: 0.14,
        rotate: degrees(38),
      });
    }
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => drawFooter(p, i, pages.length));

  // Petit rappel de la date d'émission en bas de la dernière page.
  page.drawText(
    pdfSafe(
      `Ordonnance ${rx.number} — ${rx.patient_name} — ${dateFr(rx.consultation_date)} — ${rx.establishment_name}`,
    ),
    {
      x: M,
      y: 10,
      size: 5.8,
      font: regular,
      color: COLORS.muted,
    },
  );

  return doc.save();
}
