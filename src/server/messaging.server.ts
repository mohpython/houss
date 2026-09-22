/**
 * Envoi des codes de connexion (SMS / WhatsApp) et des e-mails transactionnels.
 */
import nodemailer from "nodemailer";
import { env } from "./env.server";

// ============================================================================
// Codes OTP par téléphone
// ============================================================================

export function otpChannelAvailable(): boolean {
  switch (env.otpChannel) {
    case "twilio":
      return Boolean(env.twilioAccountSid && env.twilioAuthToken && env.twilioFrom);
    case "whatsapp":
      return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
    case "log":
      // Mode développement : le code est écrit dans les logs du serveur.
      return !env.isProd;
    default:
      return false;
  }
}

export async function sendOtp(phone: string, code: string): Promise<void> {
  const text = `SAHA Santé : votre code de connexion est ${code}. Il expire dans 10 minutes.`;

  if (env.otpChannel === "twilio") {
    const auth = Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: phone, From: env.twilioFrom, Body: text }),
      },
    );
    if (!res.ok) {
      console.error("[otp] Twilio", res.status, (await res.text()).slice(0, 300));
      throw new Error("Impossible d'envoyer le SMS. Réessayez plus tard.");
    }
    return;
  }

  if (env.otpChannel === "whatsapp") {
    const { sendAuthTemplate } = await import("@/lib/whatsapp.server");
    const template = process.env.WHATSAPP_OTP_TEMPLATE || "saha_otp";
    const lang = process.env.WHATSAPP_OTP_TEMPLATE_LANG || "fr";
    try {
      await sendAuthTemplate(phone.replace(/^\+/, ""), template, lang, code);
    } catch (err) {
      console.error("[otp] WhatsApp", err);
      throw new Error("Impossible d'envoyer le code WhatsApp. Réessayez plus tard.");
    }
    return;
  }

  console.info(`[otp] (mode log) code pour ${phone} : ${code}`);
}

// ============================================================================
// E-mail (SMTP)
// ============================================================================

let transport: nodemailer.Transporter | null = null;

function mailer() {
  if (!env.smtpConfigured) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
    });
  }
  return transport;
}

export async function sendMail(to: string, subject: string, text: string, html?: string) {
  const t = mailer();
  if (!t) {
    console.info(`[mail] (SMTP non configuré) à ${to} — ${subject}\n${text}`);
    return;
  }
  await t.sendMail({ from: env.smtpFrom, to, subject, text, html });
}
