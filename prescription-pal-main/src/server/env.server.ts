/**
 * Configuration serveur centralisée (variables d'environnement).
 * Voir `.env.example` pour la liste complète et les valeurs par défaut.
 */

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export const env = {
  get nodeEnv() {
    return str("NODE_ENV", "development");
  },
  get isProd() {
    return this.nodeEnv === "production";
  },
  /** URL publique du site, sans slash final (ex. https://sahasantemali.com). */
  get appUrl() {
    return str("APP_URL", "http://localhost:3000").replace(/\/+$/, "");
  },
  /** Secret servant à signer les URL de fichiers et l'état OAuth. */
  get appSecret() {
    const s = str("APP_SECRET");
    if (!s) {
      if (this.isProd) throw new Error("APP_SECRET manquant dans le fichier .env");
      return "dev-only-insecure-secret-change-me";
    }
    return s;
  },
  get storageDir() {
    return str("STORAGE_DIR", "./storage");
  },
  get sessionTtlDays() {
    return Number(str("SESSION_TTL_DAYS", "60")) || 60;
  },
  get schedulerEnabled() {
    return bool("SCHEDULER_ENABLED", true);
  },

  // --- IA (API compatible OpenAI : OpenRouter, Google AI Studio, OpenAI...) ---
  get aiBaseUrl() {
    return str("AI_BASE_URL", "https://openrouter.ai/api/v1");
  },
  get aiApiKey() {
    return str("AI_API_KEY");
  },
  get aiModelVision() {
    return str("AI_MODEL_VISION", "google/gemini-2.5-flash");
  },
  get aiModelText() {
    return str("AI_MODEL_TEXT", "google/gemini-2.5-flash");
  },

  // --- Authentification ---
  get googleClientId() {
    return str("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return str("GOOGLE_CLIENT_SECRET");
  },
  /** 'log' (dev), 'whatsapp' ou 'twilio'. */
  get otpChannel() {
    return str("OTP_CHANNEL", "log") as "log" | "whatsapp" | "twilio";
  },
  get twilioAccountSid() {
    return str("TWILIO_ACCOUNT_SID");
  },
  get twilioAuthToken() {
    return str("TWILIO_AUTH_TOKEN");
  },
  get twilioFrom() {
    return str("TWILIO_FROM");
  },

  // --- Email (SMTP) : réinitialisation du mot de passe ---
  get smtpHost() {
    return str("SMTP_HOST");
  },
  get smtpPort() {
    return Number(str("SMTP_PORT", "587")) || 587;
  },
  get smtpUser() {
    return str("SMTP_USER");
  },
  get smtpPass() {
    return str("SMTP_PASS");
  },
  get smtpFrom() {
    return str("SMTP_FROM", "SAHA Santé <no-reply@sahasantemali.com>");
  },
  get smtpConfigured() {
    return Boolean(this.smtpHost);
  },
};
