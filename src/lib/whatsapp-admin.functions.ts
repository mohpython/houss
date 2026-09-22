import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TEMPLATE_KEYS, defaultTemplate, type BotLang, type TemplateKey } from "@/lib/whatsapp-copy";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data: row } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!row) throw new Error("Accès réservé aux administrateurs");
}

export type WaOrder = {
  id: string;
  created_at: string;
  patient_name: string | null;
  patient_phone: string | null;
  neighborhood: string | null;
  delivery_mode: string;
  patient_address: string | null;
  pharmacy: string | null;
  courier: string | null;
  status: string;
  delivery_status: string;
  fulfillment_method: string;
  total_amount: number;
  payment_status: string;
  is_partial: boolean;
};

export type WaSession = {
  wa_phone: string;
  wa_name: string | null;
  language: string;
  state: string;
  last_message_at: string | null;
  linked: boolean;
};

export type WaTemplate = {
  key: TemplateKey;
  label: string;
  placeholders: readonly string[];
  values: Record<BotLang, { body: string; custom: boolean }>;
};

/** WhatsApp orders + live sessions for the admin follow-up board. */
export const getWhatsappOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: res, error }, { data: sessions }] = await Promise.all([
      supabaseAdmin
        .from("reservations")
        .select(
          "id, created_at, patient_name, patient_phone, delivery_mode, patient_address, status, delivery_status, fulfillment_method, total_amount, payment_status, is_partial, neighborhoods(name), pharmacies(name), couriers(full_name)",
        )
        .eq("source", "whatsapp")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("whatsapp_sessions")
        .select("wa_phone, wa_name, language, state, last_message_at, user_id")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(100),
    ]);
    if (error) throw new Error(error.message);

    const orders: WaOrder[] = (res ?? []).map((r) => {
      const row = r as unknown as Record<string, unknown>;
      const nb = row.neighborhoods as { name: string } | null;
      const ph = row.pharmacies as { name: string } | null;
      const co = row.couriers as { full_name: string } | null;
      return {
        id: r.id,
        created_at: r.created_at,
        patient_name: r.patient_name,
        patient_phone: r.patient_phone,
        neighborhood: nb?.name ?? null,
        delivery_mode: r.delivery_mode,
        patient_address: r.patient_address,
        pharmacy: ph?.name ?? null,
        courier: co?.full_name ?? null,
        status: r.status,
        delivery_status: r.delivery_status,
        fulfillment_method: r.fulfillment_method,
        total_amount: Number(r.total_amount ?? 0),
        payment_status: r.payment_status,
        is_partial: r.is_partial,
      };
    });

    const sess: WaSession[] = (sessions ?? []).map((s) => ({
      wa_phone: s.wa_phone,
      wa_name: s.wa_name,
      language: s.language,
      state: s.state,
      last_message_at: s.last_message_at,
      linked: !!s.user_id,
    }));

    return { orders, sessions: sess };
  });

/** All editable bot templates with current (custom or default) values. */
export const listWhatsappTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("whatsapp_templates").select("key, lang, body");
    if (error) throw new Error(error.message);
    const custom = new Map<string, string>();
    for (const r of data ?? []) custom.set(`${r.key}:${r.lang}`, r.body);

    const langs: BotLang[] = ["fr", "en", "ar"];
    return TEMPLATE_KEYS.map((t): WaTemplate => {
      const values = {} as WaTemplate["values"];
      for (const l of langs) {
        const c = custom.get(`${t.key}:${l}`);
        values[l] = { body: c ?? defaultTemplate(t.key, l), custom: c !== undefined };
      }
      return { key: t.key, label: t.label, placeholders: t.placeholders, values };
    });
  });

const keySchema = z.enum(TEMPLATE_KEYS.map((t) => t.key) as [TemplateKey, ...TemplateKey[]]);

/** Save a custom template; empty body resets to the built-in default. */
export const saveWhatsappTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ key: keySchema, lang: z.enum(["fr", "en", "ar"]), body: z.string().max(2000) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const body = data.body.trim();
    if (!body || body === defaultTemplate(data.key, data.lang)) {
      const { error } = await context.supabase
        .from("whatsapp_templates")
        .delete()
        .eq("key", data.key)
        .eq("lang", data.lang);
      if (error) throw new Error(error.message);
      return { ok: true, custom: false };
    }
    const { error } = await context.supabase
      .from("whatsapp_templates")
      .upsert({ key: data.key, lang: data.lang, body, updated_by: context.userId }, { onConflict: "key,lang" });
    if (error) throw new Error(error.message);
    return { ok: true, custom: true };
  });
