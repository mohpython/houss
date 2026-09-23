/**
 * Convertit un résultat Prisma en objet « JSON pur », identique à ce que
 * renvoyait Supabase/PostgREST :
 *  - les `Date` deviennent des chaînes ISO 8601 ;
 *  - les colonnes de type DATE (`prescription_date`) deviennent "YYYY-MM-DD".
 *
 * À appliquer sur toutes les valeurs renvoyées au navigateur par les server
 * functions, pour que le code front (qui manipule des chaînes) reste inchangé.
 */

const DATE_ONLY_KEYS = new Set(["prescription_date"]);

export type Plain<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Array<Plain<U>>
    : T extends object
      ? { [K in keyof T]: Plain<T[K]> }
      : T;

function convert(value: unknown, key: string | null): unknown {
  if (value instanceof Date) {
    const iso = value.toISOString();
    return key && DATE_ONLY_KEYS.has(key) ? iso.slice(0, 10) : iso;
  }
  if (Array.isArray(value)) return value.map((v) => convert(v, null));
  if (value && typeof value === "object") {
    // Prisma.Decimal / Buffer éventuels : on laisse JSON faire le travail.
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      if (typeof (value as { toJSON?: () => unknown }).toJSON === "function") {
        return (value as { toJSON: () => unknown }).toJSON();
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = convert(v, k);
    }
    return out;
  }
  if (typeof value === "bigint") return Number(value);
  return value;
}

export function toPlain<T>(value: T): Plain<T> {
  return convert(value, null) as Plain<T>;
}

/** Transforme "YYYY-MM-DD" (ou ISO) en Date UTC minuit pour une colonne DATE. */
export function toDateOnly(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}
