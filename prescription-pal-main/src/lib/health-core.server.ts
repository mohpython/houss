/**
 * Health / practitioners core — server only.
 * AI triage of symptoms + proximity matching of doctors and nurses.
 */
import { generateText } from "ai";
import { z } from "zod";
import { prisma } from "@/server/db.server";
import { textModel } from "@/server/ai.server";
import { haversineKm } from "./routing-core.server";

export const TriageSchema = z.object({
  specialty_code: z.string(),
  practitioner_type: z.enum(["doctor", "nurse"]),
  urgency: z.enum(["low", "medium", "high", "emergency"]),
  summary: z.string(),
  advice: z.string(),
  possible_conditions: z.array(z.string()).max(5),
  home_visit_suitable: z.boolean(),
});

export type Triage = z.infer<typeof TriageSchema>;

export type SpecialtyRow = {
  code: string;
  label_fr: string;
  label_en: string;
  label_ar: string;
  practitioner_type: "doctor" | "nurse";
  keywords: string[] | null;
};

export async function triageSymptoms(
  specialties: SpecialtyRow[],
  symptoms: string,
  language: string,
): Promise<Triage> {
  const catalogue = specialties
    .map((s) => `- ${s.code} (${s.practitioner_type}): ${s.label_fr} | ${s.label_en}`)
    .join("\n");

  const system = `You are a medical triage assistant for a health app in Mali (West Africa).
The patient describes symptoms in French, English, Bambara-flavoured French or Arabic.
Pick EXACTLY ONE specialty code from this catalogue:
${catalogue}

Rules:
- "specialty_code" MUST be one of the codes above, verbatim.
- "practitioner_type" must match the chosen specialty's type (nursing acts such as injections, dressings, perfusions, blood pressure checks at home => nurse).
- Endemic context: malaria (paludisme) is very common with fever, chills, headache, body aches.
- "urgency": emergency for chest pain, stroke signs, severe bleeding, unconsciousness, difficulty breathing, convulsions, high fever in infants.
- "summary" and "advice": 1-2 short sentences, written in ${language === "ar" ? "Arabic" : language === "en" ? "English" : "French"}, plain language, never a definitive diagnosis.
- "possible_conditions": up to 5 short plain-language hypotheses.
- Always remind implicitly that only the practitioner can diagnose. Never prescribe medication.
Return JSON only.`;

  const { text } = await generateText({
    model: textModel(),
    system: `${system}

Respond with a single raw JSON object, no markdown fences, with exactly these keys:
{"specialty_code": string, "practitioner_type": "doctor"|"nurse", "urgency": "low"|"medium"|"high"|"emergency", "summary": string, "advice": string, "possible_conditions": string[], "home_visit_suitable": boolean}`,
    messages: [{ role: "user", content: symptoms.slice(0, 2000) }],
  });

  const raw = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
  } catch {
    parsed = {};
  }

  const urgencyRaw = String(parsed["urgency"] ?? "medium").toLowerCase();
  const urgency = (["low", "medium", "high", "emergency"] as const).includes(urgencyRaw as "low")
    ? (urgencyRaw as Triage["urgency"])
    : urgencyRaw === "urgent"
      ? "high"
      : "medium";

  const known =
    specialties.find((s) => s.code === parsed["specialty_code"]) ??
    specialties.find((s) => s.code === "general") ??
    specialties[0];

  const conditions = Array.isArray(parsed["possible_conditions"])
    ? (parsed["possible_conditions"] as unknown[]).map(String).slice(0, 5)
    : [];

  return {
    specialty_code: known?.code ?? "general",
    practitioner_type: known?.practitioner_type ?? "doctor",
    urgency,
    summary: String(parsed["summary"] ?? symptoms.slice(0, 200)),
    advice: String(parsed["advice"] ?? ""),
    possible_conditions: conditions,
    home_visit_suitable: Boolean(parsed["home_visit_suitable"]),
  };
}

export type MatchedPractitioner = {
  id: string;
  full_name: string;
  type: "doctor" | "nurse";
  specialty_code: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  home_visits: boolean;
  consultation_fee: number | null;
  bio: string | null;
  distanceKm: number | null;
};

export async function findPractitionersCore(opts: {
  specialtyCode?: string | null;
  type?: "doctor" | "nurse" | null;
  lat?: number | null;
  lng?: number | null;
  homeVisitOnly?: boolean;
  limit?: number;
}): Promise<MatchedPractitioner[]> {
  const data = await prisma.practitioners.findMany({
    where: {
      status: "approved",
      is_available: true,
      ...(opts.specialtyCode ? { specialty_code: opts.specialtyCode } : {}),
      ...(opts.type ? { type: opts.type } : {}),
      ...(opts.homeVisitOnly ? { home_visits: true } : {}),
    },
    select: {
      id: true,
      full_name: true,
      type: true,
      specialty_code: true,
      city: true,
      address: true,
      phone: true,
      home_visits: true,
      consultation_fee: true,
      bio: true,
      lat: true,
      lng: true,
    },
  });

  const rows = (data ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    type: p.type as "doctor" | "nurse",
    specialty_code: p.specialty_code,
    city: p.city,
    address: p.address,
    phone: p.phone,
    home_visits: p.home_visits,
    consultation_fee: p.consultation_fee,
    bio: p.bio,
    distanceKm:
      opts.lat != null && opts.lng != null && p.lat != null && p.lng != null
        ? Math.round(haversineKm(opts.lat, opts.lng, p.lat, p.lng) * 10) / 10
        : null,
  }));

  rows.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return a.full_name.localeCompare(b.full_name);
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  return rows.slice(0, opts.limit ?? 12);
}
