/**
 * Fournisseur d'IA (remplace la passerelle Lovable AI).
 *
 * N'importe quelle API compatible OpenAI convient : OpenRouter (par défaut,
 * donne accès aux modèles Gemini/GPT/Claude avec une seule clé), Google AI
 * Studio (https://generativelanguage.googleapis.com/v1beta/openai), OpenAI...
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "./env.server";

export function aiProvider() {
  const apiKey = env.aiApiKey;
  if (!apiKey) throw new Error("AI_API_KEY manquant : configurez l'IA dans le fichier .env");
  return createOpenAICompatible({
    name: "saha-ai",
    baseURL: env.aiBaseUrl,
    apiKey,
    headers: {
      // Recommandé par OpenRouter, ignoré par les autres fournisseurs.
      "HTTP-Referer": env.appUrl,
      "X-Title": "SAHA Sante",
    },
  });
}

/** Modèle multimodal (lecture d'ordonnances, photos de médicaments). */
export function visionModel() {
  return aiProvider()(env.aiModelVision);
}

/** Modèle texte (triage des symptômes). */
export function textModel() {
  return aiProvider()(env.aiModelText);
}
