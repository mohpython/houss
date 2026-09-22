/**
 * Prescription date parsing / validation.
 * Client-safe: used by the UI and by the server extraction core.
 */

export const RX_VALIDITY_DAYS = 90;

const MONTHS: Record<string, number> = {
  // French
  janvier: 1, janv: 1, jan: 1,
  fevrier: 2, février: 2, fev: 2, fév: 2, feb: 2,
  mars: 3, mar: 3, march: 3,
  avril: 4, avr: 4, april: 4, apr: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6, june: 6,
  juillet: 7, juil: 7, jul: 7, july: 7,
  aout: 8, août: 8, aug: 8, august: 8,
  septembre: 9, sept: 9, sep: 9, september: 9,
  octobre: 10, oct: 10, october: 10,
  novembre: 11, nov: 11, november: 11,
  decembre: 12, décembre: 12, dec: 12, déc: 12, december: 12,
  january: 1, february: 2,
  // Arabic
  يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, ابريل: 4, مايو: 5, يونيو: 6,
  يوليو: 7, أغسطس: 8, اغسطس: 8, سبتمبر: 9, أكتوبر: 10, اكتوبر: 10,
  نوفمبر: 11, ديسمبر: 12,
  // Arabic (Levant/Maghreb variants)
  "كانون الثاني": 1, شباط: 2, آذار: 3, نيسان: 4, أيار: 5, حزيران: 6,
  تموز: 7, آب: 8, أيلول: 9, "تشرين الأول": 10, "تشرين الثاني": 11, "كانون الأول": 12,
};

/** Converts Arabic-Indic / Persian digits to ASCII. */
function normalizeDigits(input: string): string {
  return input.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function build(year: number, month: number, day: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (year < 100) {
    // Pivot two-digit years on the current year: "26" -> 2026, "99" -> 1999.
    const cy = new Date().getUTCFullYear();
    const pivot = (cy % 100) + 1;
    year += year <= pivot ? 2000 : 1900;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2200) return null;

  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Parses a human-written date in any common format (FR / EN / AR, slashes,
 * dashes, dots, spelled months, ISO) and returns `YYYY-MM-DD` or null.
 */
export function parseFlexibleDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = normalizeDigits(String(raw)).trim().toLowerCase();
  if (!s) return null;

  // strip noise like "le ", "date :", "التاريخ:"
  s = s
    .replace(/^(le|date|du|on|التاريخ|تاريخ)\s*[:\-]?\s*/i, "")
    .replace(/[،,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const g = (m: RegExpMatchArray, i: number) => Number(m[i] ?? NaN);

  // ISO first: 2026-03-12 or 2026/03/12
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return build(g(m, 1), g(m, 2), g(m, 3));

  // Spelled month: 12 mars 2026 / mars 12 2026 / 12 de mars de 2026
  const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length);
  for (const name of monthNames) {
    if (!s.includes(name)) continue;
    const rest = s.split(name);
    const before = normalizeDigits(rest[0] ?? "").match(/(\d{1,2})\s*$/);
    const afterNums = (rest[1] ?? "").match(/\d{1,4}/g) ?? [];
    const month = MONTHS[name] ?? 0;
    const last = Number(afterNums[afterNums.length - 1] ?? NaN);
    const first = Number(afterNums[0] ?? NaN);
    const second = Number(afterNums[1] ?? NaN);
    if (before && afterNums.length > 0) {
      return build(last, month, g(before, 1));
    }
    if (!before && afterNums.length >= 2) {
      return build(second, month, first);
    }
    if (!before && afterNums.length === 1 && (afterNums[0] ?? "").length === 4) {
      return build(first, month, 1);
    }
  }

  // Numeric day-first: 12/03/2026, 12-03-26, 12.03.2026
  m = s.match(/(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/);
  if (m) {
    const a = g(m, 1);
    const b = g(m, 2);
    const y = g(m, 3);
    // day-first by default (FR usage); switch when impossible
    if (a > 12 && b <= 12) return build(y, b, a);
    if (b > 12 && a <= 12) return build(y, a, b);
    return build(y, b, a);
  }

  // Month/year only: 03/2026
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return build(g(m, 2), g(m, 1), 1);

  return null;
}

export type RxDateStatus = "valid" | "expired" | "future" | "missing";

export function rxDateStatus(iso: string | null | undefined): RxDateStatus {
  if (!iso) return "missing";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "missing";
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((todayUtc - d.getTime()) / 86400000);
  if (diffDays < 0) return "future";
  if (diffDays > RX_VALIDITY_DAYS) return "expired";
  return "valid";
}

export function daysSince(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`).getTime();
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((todayUtc - d) / 86400000);
}

/** Extracts a 4-digit year written in a raw date string, if any. */
export function extractWrittenYear(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = String(raw).replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
  const m = s.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

export type ResolvedRxDate = {
  /** Final YYYY-MM-DD or null. */
  iso: string | null;
  /** True when the AI ISO year contradicts the year written on the document. */
  yearConflict: boolean;
  /** True when the year is outside a plausible prescription window. */
  implausibleYear: boolean;
};

/**
 * Reconciles the raw date read on the document with the ISO date produced by
 * the AI. The year written on the paper always wins over the AI normalization,
 * which is where most model errors happen.
 */
export function resolveRxDate(
  raw: string | null | undefined,
  aiIso: string | null | undefined,
): ResolvedRxDate {
  const fromRaw = parseFlexibleDate(raw);
  const fromIso = parseFlexibleDate(aiIso);
  const writtenYear = extractWrittenYear(raw);

  let iso = fromRaw ?? fromIso;
  let yearConflict = false;

  if (fromRaw && fromIso && fromRaw !== fromIso) {
    // Same day/month but different year => trust the written year.
    yearConflict = fromRaw.slice(5) === fromIso.slice(5);
    iso = fromRaw;
  }

  if (iso && writtenYear && Number(iso.slice(0, 4)) !== writtenYear) {
    iso = `${writtenYear}${iso.slice(4)}`;
    yearConflict = true;
  }

  let implausibleYear = false;
  if (iso) {
    const y = Number(iso.slice(0, 4));
    const cy = new Date().getUTCFullYear();
    if (y < cy - 5 || y > cy + 1) implausibleYear = true;
  }

  return { iso, yearConflict, implausibleYear };
}
