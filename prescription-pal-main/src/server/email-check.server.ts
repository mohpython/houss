/**
 * Contrôle de « livrabilité » d'une adresse e-mail avant la création d'un compte.
 *
 * Tant que l'envoi d'e-mail (SMTP) n'est pas configuré, une adresse saisie
 * librement ne peut pas être prouvée : on applique donc deux garde-fous
 * immédiats, sans dépendance externe.
 *
 *   1. les domaines de boîtes jetables / temporaires sont refusés ;
 *   2. le domaine doit pouvoir recevoir du courrier, c'est-à-dire publier un
 *      enregistrement MX ou, à défaut, une adresse IP (MX implicite,
 *      RFC 5321 §5.1). Un domaine inventé (`domaine-inexistant.xyz`) est donc
 *      rejeté, comme le sont les fautes de frappe les plus courantes.
 *
 * Ces contrôles ne remplacent pas une preuve de possession (code envoyé par
 * e-mail) : ils bloquent l'essentiel des faux comptes, pas une usurpation
 * ciblée. Voir `scripts/backfill-email-verified.sql` pour l'état existant.
 */
import { Resolver } from "node:dns/promises";

/**
 * Normalise un domaine pour la comparaison : `sub.MAILINATOR.com` et
 * `mailinator.com` doivent être refusés tous les deux.
 */
function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.+$/, "");
}

/** Boîtes jetables / temporaires les plus utilisées (sous-domaines inclus). */
const DISPOSABLE_DOMAINS = new Set([
  "0-mail.com",
  "10minutemail.com",
  "20minutemail.com",
  "33mail.com",
  "dispostable.com",
  "email-fake.com",
  "emailondeck.com",
  "fakeinbox.com",
  "fakemail.net",
  "getairmail.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "inboxbear.com",
  "mail-temporaire.fr",
  "mail.tm",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mintemail.com",
  "mytemp.email",
  "sharklasers.com",
  "spam4.me",
  "tempmail.com",
  "tempmail.net",
  "tempmailo.com",
  "temp-mail.org",
  "temp-mail.io",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.de",
  "yopmail.com",
  "yopmail.fr",
  "mail-tester.com",
  "burnermail.io",
  "dropmail.me",
  "linshiyouxiang.net",
  "24mail.chacuo.net",
  "discard.email",
  "discardmail.com",
  "mailsac.com",
  "inboxkitten.com",
  "tempinbox.com",
  "emailtemporanea.net",
  "moakt.com",
  "mytemp.email",
  "tmpmail.net",
  "tmpeml.com",
]);

const CACHE_TTL_MS = 60 * 60_000;
const cache = new Map<string, { at: number; status: MailStatus }>();

type MailStatus = "yes" | "no" | "unknown";

/** Erreurs DNS d'infrastructure : le contrôle doit laisser passer (fail open). */
function isDnsInfraError(e: unknown): boolean {
  const code = (e as NodeJS.ErrnoException | undefined)?.code ?? "";
  return code === "EAI_AGAIN" || code === "ETIMEOUT" || code === "ESERVFAIL" || code === "ECONNREFUSED" || code === "ECONNRESET";
}

function remember(domain: string, status: MailStatus): MailStatus {
  cache.set(domain, { at: Date.now(), status });
  return status;
}

/** Le domaine publie-t-il des serveurs de réception ? */
async function domainMailStatus(domain: string): Promise<MailStatus> {
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.status;

  const resolver = new Resolver({ timeout: 3000, tries: 1 });

  try {
    const mx = await resolver.resolveMx(domain);
    if (mx.length > 0) return remember(domain, "yes");
  } catch (e) {
    if (isDnsInfraError(e)) return "unknown";
  }
  // MX implicite : un domaine avec une adresse IP reçoit du courrier.
  try {
    const v4 = await resolver.resolve4(domain);
    if (v4.length > 0) return remember(domain, "yes");
  } catch (e) {
    if (isDnsInfraError(e)) return "unknown";
  }
  return remember(domain, "no");
}

export type EmailCheckResult = { ok: true } | { ok: false; reason: string };

/**
 * Vérifie l'adresse avant création de compte.
 * `ok: false` = inscription refusée avec un message lisible par l'utilisateur.
 */
export async function checkEmailDeliverable(email: string): Promise<EmailCheckResult> {
  const domain = normalizeDomain(email.split("@")[1] ?? "");
  if (!domain || !domain.includes(".")) {
    return { ok: false, reason: "Adresse e-mail invalide." };
  }
  // Un sous-domaine d'un domaine jetable l'est aussi : on teste chaque suffixe.
  let probe: string | null = domain;
  let disposable = false;
  while (probe) {
    if (DISPOSABLE_DOMAINS.has(probe)) {
      disposable = true;
      break;
    }
    const cut = probe.indexOf(".");
    probe = cut === -1 ? null : probe.slice(cut + 1);
  }
  if (disposable) {
    return { ok: false, reason: "Les adresses e-mail jetables ne sont pas acceptées." };
  }
  const status = await domainMailStatus(domain);
  if (status === "unknown") {
    // DNS momentanément indisponible : on ne bloque pas une inscription légitime.
    console.warn(`[email-check] contrôle ignoré pour ${domain} (DNS indisponible)`);
    return { ok: true };
  }
  if (status === "no") {
    return {
      ok: false,
      reason: "Ce domaine ne peut pas recevoir d'e-mail. Vérifiez l'adresse saisie.",
    };
  }
  return { ok: true };
}