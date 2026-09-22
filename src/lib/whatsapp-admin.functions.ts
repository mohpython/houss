import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import {
  TEMPLATE_KEYS,
  defaultTemplate,
  type BotLang,
  type TemplateKey,
} from "@/lib/whatsapp-copy";

async function assertAdmin(userId: string) {
  const { assertAdmin: check } = await import("@/server/authz.server");
  await check(userId, "Accès réservé aux administrateurs");
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
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { prisma } = await import("@/server/db.server");

    const [res, sessions] = await Promise.all([
      prisma.reservations.findMany({
        where: { source: "whatsapp" },
        select: {
          id: true,
          created_at: true,
          patient_name: true,
          patient_phone: true,
          delivery_mode: true,
          patient_address: true,
          status: true,
          delivery_status: true,
          fulfillment_method: true,
          total_amount: true,
          payment_status: true,
          is_partial: true,
          neighborhoods: { select: { name: true } },
          pharmacies: { select: { name: true } },
          couriers: { select: { full_name: true } },
        },
        orderBy: { created_at: "desc" },
        take: 200,
      }),
      prisma.whatsapp_sessions.findMany({
        select: {
          wa_phone: true,
          wa_name: true,
          language: true,
          state: true,
          last_message_at: true,
          user_id: true,
        },
        orderBy: { last_message_at: { sort: "desc", nulls: "last" } },
        take: 100,
      }),
    ]);

    const orders: WaOrder[] = res.map((r) => {
      const nb = r.neighborhoods;
      const ph = r.pharmacies;
      const co = r.couriers;
      return {
        id: r.id,
        created_at: r.created_at.toISOString(),
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

    const sess: WaSession[] = sessions.map((s) => ({
      wa_phone: s.wa_phone,
      wa_name: s.wa_name,
      language: s.language,
      state: s.state,
      last_message_at: s.last_message_at ? s.last_message_at.toISOString() : null,
      linked: !!s.user_id,
    }));

    return { orders, sessions: sess };
  });

/** All editable bot templates with current (custom or default) values. */
export const listWhatsappTemplates = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { prisma } = await import("@/server/db.server");
    const data = await prisma.whatsapp_templates.findMany({
      select: { key: true, lang: true, body: true },
    });
    const custom = new Map<string, string>();
    for (const r of data) custom.set(`${r.key}:${r.lang}`, r.body);

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
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ key: keySchema, lang: z.enum(["fr", "en", "ar"]), body: z.string().max(2000) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { prisma } = await import("@/server/db.server");
    const body = data.body.trim();
    if (!body || body === defaultTemplate(data.key, data.lang)) {
      await prisma.whatsapp_templates.deleteMany({ where: { key: data.key, lang: data.lang } });
      return { ok: true, custom: false };
    }
    await prisma.whatsapp_templates.upsert({
      where: { key_lang: { key: data.key, lang: data.lang } },
      create: { key: data.key, lang: data.lang, body, updated_by: context.userId },
      update: { body, updated_by: context.userId },
    });
    return { ok: true, custom: true };
  });
