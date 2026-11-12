/**
 * Lecture vocale des instructions (Web Speech API).
 *
 * La voix suit la langue choisie par le patient (FR / EN / AR). Si le
 * navigateur ne dispose pas de voix pour cette langue, on bascule sur une
 * langue de repli et l'interface le signale.
 *
 * Le navigateur n'expose pas d'API de synthèse côté serveur : c'est le poste
 * du patient qui parle, ce qui convient (aucune donnée envoyée).
 */

export type SpeechLang = "fr" | "en" | "ar";

/** Langue du site → langue de synthèse vocale. */
const VOICES: Record<string, string> = {
  fr: "fr-FR",
  en: "en-US",
  ar: "ar-SA",
  bm: "fr-FR", // pas de voix bamanankan dans les navigateurs
};

const STORAGE_KEY = "saha_voice_enabled";

let enabled = true;
let loaded = false;

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

/** Charge la préférence « lecture vocale » depuis le navigateur. */
export function loadVoicePreference(): boolean {
  if (loaded) return enabled;
  loaded = true;
  try {
    enabled = localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    enabled = true;
  }
  return enabled;
}

export function isVoiceEnabled(): boolean {
  return loadVoicePreference();
}

export function setVoiceEnabled(value: boolean): void {
  enabled = value;
  loaded = true;
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (!value) stopSpeaking();
}

/** Langue de synthèse réellement disponible (peut différer de la langue du site). */
export function spokenLanguage(lang: string): string {
  const wanted = VOICES[lang] ?? "fr-FR";
  const s = synth();
  if (!s) return wanted;
  const voices = s.getVoices();
  if (voices.length === 0) return wanted;
  const exact = voices.some((v) => v.lang.toLowerCase() === wanted.toLowerCase());
  if (exact) return wanted;
  // Repli : français si présent, sinon la langue du site telle quelle.
  const fr = voices.some((v) => v.lang.toLowerCase().startsWith("fr"));
  return fr ? "fr-FR" : wanted;
}

/** Vrai quand la voix demandée n'existe pas sur cet appareil. */
export function usingVoiceFallback(lang: string): boolean {
  const wanted = VOICES[lang] ?? "fr-FR";
  return spokenLanguage(lang) !== wanted;
}

export function isSpeaking(): boolean {
  const s = synth();
  return !!s && s.speaking;
}

export function stopSpeaking(): void {
  try {
    synth()?.cancel();
  } catch {
    /* ignore */
  }
}

/**
 * Lit un texte à voix haute dans la langue du site.
 * Retourne `false` si la synthèse n'est pas disponible sur ce navigateur.
 */
export function speak(text: string, lang: string): boolean {
  const s = synth();
  if (!s || !text.trim()) return false;
  if (!loadVoicePreference()) return false;
  try {
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = spokenLanguage(lang);
    u.rate = 0.95;
    u.pitch = 1;
    // Certaines plateformes ont besoin d'un petit délai pour charger les voix.
    const voices = s.getVoices();
    if (voices.length > 0) {
      const match = voices.find((v) => v.lang.toLowerCase() === u.lang.toLowerCase());
      if (match) u.voice = match;
    }
    s.speak(u);
    return true;
  } catch {
    return false;
  }
}
