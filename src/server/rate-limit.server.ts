/**
 * Limiteur de débit en mémoire (fenêtre fixe), suffisant pour un seul
 * processus Node. Protège les points sensibles (connexion, envoi de codes).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count++;
  if (b.count > max) {
    const wait = Math.ceil((b.resetAt - now) / 1000);
    throw new Error(`Trop de tentatives. Réessayez dans ${wait} s.`);
  }
}

// Nettoyage périodique pour éviter la croissance de la Map.
const timer = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}, 60_000);
timer.unref?.();
