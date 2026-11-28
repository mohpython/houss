/**
 * Envoi des codes de connexion (SMS / WhatsApp) et des e-mails transactionnels.
 */
import nodemailer from "nodemailer";
import { env } from "./env.server";
import { whatsappConfigured } from "@/lib/whatsapp.server";

// ============================================================================
// Codes OTP par téléphone
// ============================================================================

export function otpChannelAvailable(): boolean {
  switch (env.otpChannel) {
    case "twilio":
      return Boolean(env.twilioAccountSid && env.twilioAuthToken && env.twilioFrom);
    case "whatsapp":
      return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
    case "orangesms":
      return Boolean(
        env.orangeSmsClientId && env.orangeSmsClientSecret && env.orangeSmsSender,
      );
    case "log":
      // Mode développement : le code est écrit dans les logs du serveur.
      return !env.isProd;
    default:
      return false;
  }
}

export async function sendOtp(phone: string, code: string, appHash?: string): Promise<void> {
  // Format compatible à la fois avec :
  // - Android SMS Retriever API (hash de signature à 11 caractères en fin de SMS : 0 clic)
  // - W3C WebOTP / Autofill iOS & Android (@domaine #code sur la dernière ligne)
  const hash = appHash && /^[A-Za-z0-9+/=_-]{11}$/.test(appHash) ? appHash : "JUxjDqTvDuX";
  const text = `SAHA Sante : votre code de connexion est ${code}. Valable 10 min.\n@${env.appHost} #${code} ${hash}`;

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

  if (env.otpChannel === "orangesms") {
    const { sendSms, orangeSmsConfigured } = await import("@/lib/orange-sms.server");
    if (!orangeSmsConfigured()) {
      throw new Error("Orange SMS non configuré. Vérifiez ORANGE_SMS_* dans le .env.");
    }
    try {
      await sendSms(phone, text);
    } catch (err) {
      console.error("[otp] Orange SMS", err);
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

// ============================================================================
// Livraison OTP multi-canaux
// ============================================================================

export type OtpChannel = "sms" | "whatsapp" | "email";

/**
 * Canaux réellement configurés. `OTP_CHANNEL=whatsapp` est compté comme
 * WhatsApp uniquement (afin de n'envoyer qu'une seule fois le même code).
 */
export function deliveryChannelsAvailable(): Record<OtpChannel, boolean> {
  const sms = otpChannelAvailable() && env.otpChannel !== "whatsapp";
  return {
    sms,
    whatsapp: whatsappConfigured() || (otpChannelAvailable() && env.otpChannel === "whatsapp"),
    email: env.smtpConfigured,
  };
}

/**
 * Envoie le MÊME code sur tous les canaux disponibles : Orange peut répondre
 * 201 sans distribuer le SMS, on ne peut donc pas attendre un échec pour
 * essayer les autres canaux. Les erreurs isolées sont collectées mais seules
 * les erreurs de tous les canaux font échouer la demande.
 */
export async function deliverOtp(
  phone: string,
  code: string,
  appHash?: string,
  email?: string | null,
): Promise<{ channels: OtpChannel[] }> {
  const channels: OtpChannel[] = [];
  const available = deliveryChannelsAvailable();

  if (available.sms) {
    try {
      await sendOtp(phone, code, appHash);
      channels.push("sms");
    } catch (err) {
      console.error("[otp] échec SMS", err);
    }
  }

  if (available.whatsapp) {
    try {
      const { sendAuthTemplate } = await import("@/lib/whatsapp.server");
      await sendAuthTemplate(
        phone.replace(/^\+/, ""),
        process.env.WHATSAPP_OTP_TEMPLATE || "saha_otp",
        process.env.WHATSAPP_OTP_TEMPLATE_LANG || "fr",
        code,
      );
      channels.push("whatsapp");
    } catch (err) {
      console.error("[otp] échec WhatsApp", err);
    }
  }

  const toEmail = email?.trim();
  if (available.email && toEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    try {
      const text = `Votre code de connexion SAHA Santé est ${code}. Valable 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`;
      await sendMail(toEmail, "Votre code SAHA Santé", text);
      channels.push("email");
    } catch (err) {
      console.error("[otp] échec e-mail", err);
    }
  }

  if (!channels.length) {
    throw new Error("Aucun canal de vérification disponible. Contactez le support.");
  }
  return { channels };
}
