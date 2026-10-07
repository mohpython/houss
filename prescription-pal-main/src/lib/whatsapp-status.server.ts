/**
 * Envois WhatsApp proactifs au patient d'une commande passée via le bot.
 *
 * Le bot promet « Vous recevrez un message à chaque étape » : ce module tient
 * cette promesse pour les réservations `source = "whatsapp"`. Chaque envoi est
 * best-effort — hors de la fenêtre de 24 h, l'API Meta refuse les messages
 * libres ; on journalise alors l'échec sans faire échouer le flux métier.
 *
 * Importé uniquement par `lifecycle.server.ts`. Ce module n'utilise que des
 * modules « feuilles » (prisma-base sans hooks, client WhatsApp, copy) pour
 * éviter tout cycle d'imports.
 */
import { botLang, statusLabel, COPY } from "./whatsapp-copy";
import { sendText, whatsappConfigured } from "./whatsapp.server";
import { basePrisma } from "@/server/prisma-base.server";

const APP_URL = "https://sahasantemali.com";

export type WaStatusKind =
  | "accepted"
  | "rejected"
  | "ready"
  | "cancelled"
  | "courier_assigned"
  | "picked_up"
  | "en_route"
  | "delivered"
  | "failed";

type WaStatusInput = {
  patientId: string;
  reservationId: string;
  kind: WaStatusKind;
  courierName?: string | null;
  pickupCode?: string | null;
  receiptCode?: string | null;
};

export async function notifyWhatsappStatus(opts: WaStatusInput): Promise<void> {
  try {
    if (!whatsappConfigured()) return;

    const session = await basePrisma.whatsapp_sessions.findFirst({
      where: { user_id: opts.patientId },
      orderBy: { last_message_at: "desc" },
      select: { wa_phone: true, language: true },
    });
    if (!session) return;

    const lang = botLang(session.language);
    const link = `${APP_URL}/app/reservations/${opts.reservationId}`;
    const slack = `\n\n${COPY[lang].linkedAccount(link)}`;

    let msg = "";
    switch (opts.kind) {
      case "accepted":
        msg = `✅ ${statusLabel(lang, "accepted")}.${slack}`;
        break;
      case "rejected":
        msg = `❌ ${statusLabel(lang, "rejected")}.${slack}`;
        break;
      case "ready": {
        const codes =
          opts.pickupCode && opts.receiptCode
            ? `\n\n${COPY[lang].codesMessage({ pickup: opts.pickupCode, receipt: opts.receiptCode })}`
            : "";
        msg = `${statusLabel(lang, "ready")} ✅${codes}${slack}`;
        break;
      }
      case "cancelled":
        msg = `${statusLabel(lang, "cancelled")}. 🚫${slack}`;
        break;
      case "courier_assigned":
        msg = `${COPY[lang].courierAssigned(opts.courierName ?? "—")}${slack}`;
        break;
      case "picked_up":
        msg = `📦 ${statusLabel(lang, "picked_up")}${slack}`;
        break;
      case "en_route":
        msg = `🛵 ${statusLabel(lang, "en_route")}${slack}`;
        break;
      case "delivered":
        msg = `✅ ${statusLabel(lang, "delivered")}.${slack}`;
        break;
      case "failed":
        msg = `⚠️ ${statusLabel(lang, "failed")}${slack}`;
        break;
    }

    if (!msg) return;
    // preview_url : le lien de suivi doit être cliquable depuis WhatsApp.
    await sendText(session.wa_phone, msg, true);
  } catch (err) {
    console.error(`[whatsapp-status] ${opts.kind}`, err instanceof Error ? err.message : err);
  }
}