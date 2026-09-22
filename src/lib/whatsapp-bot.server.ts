/**
 * WhatsApp bot state machine — server only.
 *
 * Mirrors the web app flow:
 *   photo d'ordonnance -> extraction IA -> médicaments affichés -> confirmation
 *   -> position -> pharmacie ayant 100% du stock -> réservation -> livreur.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractPrescriptionCore } from "./rx-core.server";
import { autoRouteCore, resolveDeliveryTarget } from "./routing-core.server";
import {
  sendText,
  sendButtons,
  sendLocationRequest,
  downloadMedia,
} from "./whatsapp.server";
import { mergeCopy, botLang, statusLabel, detectLangCommand, type BotLang } from "./whatsapp-copy";

/* ------------------------------------------------------------------ admin templates */

let templateCache: { at: number; rows: Record<string, Record<string, string>> } | null = null;

async function loadTemplates() {
  if (templateCache && Date.now() - templateCache.at < 60_000) return;
  const rows: Record<string, Record<string, string>> = { fr: {}, en: {}, ar: {} };
  try {
    const { data } = await supabaseAdmin.from("whatsapp_templates").select("key, lang, body");
    for (const r of data ?? []) (rows[r.lang] ??= {})[r.key] = r.body;
  } catch (err) {
    console.error("[whatsapp-bot] templates", err);
  }
  templateCache = { at: Date.now(), rows };
}

/** Built-in copy merged with admin overrides (call loadTemplates() first). */
const COPY = new Proxy({} as Record<BotLang, ReturnType<typeof mergeCopy>>, {
  get: (_t, lang: string) => mergeCopy(botLang(lang), templateCache?.rows[lang] ?? {}),
});

const APP_URL = "https://sahasantemali.com";

const BTN = {
  sendRx: "saha_send_rx",
  noRx: "saha_no_rx",
  track: "saha_track",
  confirm: "saha_confirm",
  retry: "saha_retry",
  delivery: "saha_delivery",
  pickup: "saha_pickup",
  orderOk: "saha_order_ok",
  orderCancel: "saha_order_cancel",
} as const;

type SessionRow = {
  id: string;
  wa_phone: string;
  user_id: string | null;
  language: string;
  state: string;
  context: Record<string, unknown>;
};

export type InboundMessage = {
  id: string;
  from: string;
  profileName?: string | null;
  type: string;
  text?: string;
  buttonId?: string;
  mediaId?: string;
  mediaMime?: string;
  location?: { lat: number; lng: number; address?: string | null };
};

/* ------------------------------------------------------------------ session */

async function getSession(from: string, name?: string | null): Promise<SessionRow> {
  const { data: existing } = await supabaseAdmin
    .from("whatsapp_sessions")
    .select("id, wa_phone, user_id, language, state, context")
    .eq("wa_phone", from)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("whatsapp_sessions")
      .update({ last_message_at: new Date().toISOString(), ...(name ? { wa_name: name } : {}) })
      .eq("id", existing.id);
    return existing as SessionRow;
  }

  const { data: created, error } = await supabaseAdmin
    .from("whatsapp_sessions")
    .insert({
      wa_phone: from,
      wa_name: name ?? null,
      state: "idle",
      last_message_at: new Date().toISOString(),
    })
    .select("id, wa_phone, user_id, language, state, context")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Session WhatsApp impossible");
  return created as SessionRow;
}

async function patchSession(
  session: SessionRow,
  patch: Partial<Pick<SessionRow, "state" | "language" | "user_id">> & {
    context?: Record<string, unknown>;
  },
) {
  await supabaseAdmin
    .from("whatsapp_sessions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("id", session.id);
  Object.assign(session, patch);
}

/** Links the WhatsApp number to an existing account, or creates a light one. */
async function ensureUser(session: SessionRow, name?: string | null): Promise<string> {
  if (session.user_id) return session.user_id;

  const e164 = `+${session.wa_phone.replace(/\D/g, "")}`;
  const digits = e164.slice(1);

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, language")
    .or(`phone.eq.${e164},phone.eq.${digits}`)
    .limit(1)
    .maybeSingle();

  if (profile) {
    await patchSession(session, {
      user_id: profile.id,
      ...(profile.language ? { language: profile.language } : {}),
    });
    return profile.id;
  }

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    phone: e164,
    phone_confirm: true,
    user_metadata: { full_name: name ?? "", phone: e164, source: "whatsapp" },
  });
  if (error || !created.user) {
    throw new Error(error?.message ?? "Création du compte impossible");
  }
  await patchSession(session, { user_id: created.user.id });
  return created.user.id;
}

/* ------------------------------------------------------------------ helpers */

function ref(id: string) {
  return id.slice(0, 8).toUpperCase();
}

async function sendMenu(to: string, lang: BotLang, intro?: string) {
  const c = COPY[lang];
  await sendButtons(
    to,
    intro ? `${intro}\n\n${c.welcome}` : c.welcome,
    [
      { id: BTN.sendRx, title: c.btnSendRx },
      { id: BTN.noRx, title: c.btnNoRx },
      { id: BTN.track, title: c.btnTrack },
    ],
    c.welcomeHeader,
  );
}

async function listMedicines(prescriptionId: string) {
  const { data } = await supabaseAdmin
    .from("prescription_items")
    .select("medicine_name_raw, strength, dosage, duration")
    .eq("prescription_id", prescriptionId);
  return data ?? [];
}

async function sendTracking(session: SessionRow, lang: BotLang) {
  const c = COPY[lang];
  const userId = session.user_id;
  if (!userId) {
    await sendText(session.wa_phone, c.trackNone);
    return;
  }
  const { data: rows } = await supabaseAdmin
    .from("reservations")
    .select("id, status, delivery_status, pharmacies(name)")
    .eq("patient_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!rows || rows.length === 0) {
    await sendText(session.wa_phone, c.trackNone);
    return;
  }

  const lines = rows.map((r) =>
    c.statusLine({
      ref: ref(r.id),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pharmacy: (r as any).pharmacies?.name ?? "—",
      status: statusLabel(lang, r.status),
      delivery: statusLabel(lang, r.delivery_status),
    }),
  );
  await sendText(
    session.wa_phone,
    `${c.trackHeader}\n\n${lines.join("\n\n")}\n\n${c.linkedAccount(`${APP_URL}/app/reservations`)}`,
  );
}

/* ------------------------------------------------------- prescription intake */

async function handlePrescriptionMedia(session: SessionRow, lang: BotLang, msg: InboundMessage) {
  const c = COPY[lang];
  const userId = await ensureUser(session, msg.profileName);

  await sendText(session.wa_phone, `${c.photoReceived}\n${c.analyzing}`);

  const media = await downloadMedia(msg.mediaId!);
  const mime = msg.mediaMime ?? media.mimeType;
  const ext = mime === "application/pdf" ? "pdf" : (mime.split("/")[1] ?? "jpg");
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from("prescriptions")
    .upload(path, media.bytes, { contentType: mime });
  if (upErr) throw new Error(upErr.message);

  const { data: rx, error: insErr } = await supabaseAdmin
    .from("prescriptions")
    .insert({
      patient_id: userId,
      file_path: path,
      file_mime: mime,
      status: "uploaded",
      source: "whatsapp",
    })
    .select("id")
    .single();
  if (insErr || !rx) throw new Error(insErr?.message ?? "Enregistrement impossible");

  try {
    await extractPrescriptionCore(supabaseAdmin, userId, rx.id);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Erreur inconnue";
    await patchSession(session, { state: "awaiting_rx" });
    await sendText(session.wa_phone, c.extractionFailed.replace("%s", reason));
    return;
  }

  const items = await listMedicines(rx.id);
  if (items.length === 0) {
    await patchSession(session, { state: "awaiting_rx" });
    await sendText(session.wa_phone, c.noMedicines);
    return;
  }

  const lines = items.map((i, n) => {
    const bits = [i.strength, i.dosage, i.duration].filter(Boolean).join(" · ");
    return `${n + 1}. *${i.medicine_name_raw}*${bits ? `\n   ${bits}` : ""}`;
  });

  await patchSession(session, {
    state: "awaiting_confirm",
    context: { prescription_id: rx.id },
  });

  await sendButtons(
    session.wa_phone,
    `${c.medicinesHeader}\n\n${lines.join("\n")}\n\n${c.confirmQuestion}`,
    [
      { id: BTN.confirm, title: c.btnConfirm },
      { id: BTN.retry, title: c.btnRetry },
    ],
  );
}

/* -------------------------------------------------------------- free order */

async function handleFreeOrderText(session: SessionRow, lang: BotLang, text: string) {
  const c = COPY[lang];
  const userId = await ensureUser(session);
  const names = text
    .split(/[\n,;]+/)
    .map((s) => s.replace(/^[-•\d.)\s]+/, "").trim())
    .filter((s) => s.length > 1)
    .slice(0, 20);

  if (names.length === 0) {
    await sendText(session.wa_phone, c.askFreeOrder);
    return;
  }

  const path = `${userId}/${crypto.randomUUID()}.txt`;
  await supabaseAdmin.storage
    .from("prescriptions")
    .upload(path, new TextEncoder().encode(names.join("\n")), { contentType: "text/plain" });

  const { data: rx, error } = await supabaseAdmin
    .from("prescriptions")
    .insert({
      patient_id: userId,
      file_path: path,
      file_mime: "text/plain",
      status: "verified",
      source: "whatsapp",
    })
    .select("id")
    .single();
  if (error || !rx) throw new Error(error?.message ?? "Enregistrement impossible");

  await supabaseAdmin.from("prescription_items").insert(
    names.map((n) => ({
      prescription_id: rx.id,
      medicine_name_raw: n,
      patient_verified: true,
    })),
  );

  await patchSession(session, {
    state: "awaiting_location",
    context: { prescription_id: rx.id },
  });
  await sendText(session.wa_phone, c.freeOrderSaved);
  await sendLocationRequest(session.wa_phone, c.askLocation);
}

/* ---------------------------------------------------------------- routing */

type DeliveryChoice =
  | { kind: "gps"; lat: number; lng: number; address?: string | null }
  | { kind: "neighborhood"; neighborhoodId: string };

/** Routes the pending prescription to a pharmacy using the chosen delivery point. */
async function routeOrder(session: SessionRow, lang: BotLang, choice: DeliveryChoice) {
  const c = COPY[lang];
  const prescriptionId = session.context?.["prescription_id"] as string | undefined;
  if (!prescriptionId) {
    await patchSession(session, { state: "idle", context: {} });
    await sendMenu(session.wa_phone, lang, c.fallback);
    return;
  }
  const userId = await ensureUser(session);
  await sendText(session.wa_phone, c.searching);

  let routed: Awaited<ReturnType<typeof autoRouteCore>>;
  try {
    // Neighborhood coordinates are resolved server-side (source of truth).
    const target = await resolveDeliveryTarget(supabaseAdmin, {
      lat: choice.kind === "gps" ? choice.lat : null,
      lng: choice.kind === "gps" ? choice.lng : null,
      address: choice.kind === "gps" ? (choice.address ?? null) : null,
      neighborhoodId: choice.kind === "neighborhood" ? choice.neighborhoodId : null,
    });
    routed = await autoRouteCore(supabaseAdmin, {
      prescriptionId,
      patientId: userId,
      patientLat: target.lat,
      patientLng: target.lng,
      patientAddress: target.address,
      neighborhoodId: target.neighborhoodId,
      deliveryMode: target.deliveryMode,
      notes: "Commande via WhatsApp",
      source: "whatsapp",
    });
  } catch {
    await patchSession(session, { state: "idle", context: {} });
    await sendText(session.wa_phone, c.noPharmacy);
    await sendMenu(session.wa_phone, lang);
    return;
  }

  await patchSession(session, { state: "idle", context: {} });

  await sendText(
    session.wa_phone,
    routed
      ? c.routed({
          pharmacy: routed.pharmacyName,
          address: routed.pharmacyAddress ?? "—",
          distance: routed.distanceKm.toFixed(1),
          ref: ref(routed.reservationId),
        })
      : c.error,
  );

  await sendText(
    session.wa_phone,
    `${Math.round(routed.totalAmount).toLocaleString("fr-FR")} FCFA\n\n${c.linkedAccount(
      `${APP_URL}/app/reservations/${routed.reservationId}/checkout`,
    )}`,
  );
}

async function handleLocation(session: SessionRow, lang: BotLang, msg: InboundMessage) {
  await routeOrder(session, lang, {
    kind: "gps",
    lat: msg.location!.lat,
    lng: msg.location!.lng,
    address: msg.location!.address ?? null,
  });
}

function foldName(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type NbCandidate = { id: string; name: string };

/**
 * Text received while waiting for the delivery place: either a number picking
 * one of the previously proposed neighborhoods, or a neighborhood name.
 */
async function handleNeighborhoodText(session: SessionRow, lang: BotLang, text: string) {
  const c = COPY[lang];
  const candidates = (session.context?.["nb_candidates"] as NbCandidate[] | undefined) ?? [];
  const t = text.trim();

  if (candidates.length > 0 && /^\d{1,2}$/.test(t)) {
    const pick = candidates[Number(t) - 1];
    if (pick) {
      await routeOrder(session, lang, { kind: "neighborhood", neighborhoodId: pick.id });
      return;
    }
  }

  const query = foldName(t);
  if (query.length < 3) {
    await sendLocationRequest(session.wa_phone, c.locationMissing);
    return;
  }

  const { data: rows } = await supabaseAdmin
    .from("neighborhoods")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  const all: NbCandidate[] = rows ?? [];

  const exact = all.filter((n) => foldName(n.name) === query);
  const partial = exact.length
    ? exact
    : all.filter((n) => {
        const nm = foldName(n.name);
        return nm.includes(query) || query.includes(nm);
      });

  if (partial.length === 1) {
    await routeOrder(session, lang, { kind: "neighborhood", neighborhoodId: partial[0]!.id });
    return;
  }
  if (partial.length > 1) {
    const shortlist = partial.slice(0, 5);
    await patchSession(session, {
      context: { ...(session.context ?? {}), nb_candidates: shortlist },
    });
    await sendText(session.wa_phone, c.neighborhoodPick(shortlist.map((n) => n.name)));
    return;
  }
  await sendLocationRequest(session.wa_phone, c.neighborhoodNotFound);
}

/* ------------------------------------------------------------------ router */

export async function handleInbound(msg: InboundMessage): Promise<void> {
  await loadTemplates();
  const session = await getSession(msg.from, msg.profileName);
  let lang = botLang(session.language);
  const c = () => COPY[lang];

  try {
    if (msg.type === "text" && msg.text) {
      const switched = detectLangCommand(msg.text);
      if (switched) {
        lang = switched;
        await patchSession(session, { language: switched, state: "idle", context: {} });
        await sendMenu(session.wa_phone, lang);
        return;
      }
    }

    const action = msg.buttonId ?? null;

    if (action === BTN.sendRx) {
      await patchSession(session, { state: "awaiting_rx", context: {} });
      await sendText(session.wa_phone, c().askPhoto);
      return;
    }
    if (action === BTN.noRx) {
      await patchSession(session, { state: "awaiting_free_order", context: {} });
      await sendText(session.wa_phone, c().askFreeOrder);
      return;
    }
    if (action === BTN.track) {
      await ensureUser(session, msg.profileName);
      await sendTracking(session, lang);
      return;
    }
    if (action === BTN.retry) {
      await patchSession(session, { state: "awaiting_rx", context: {} });
      await sendText(session.wa_phone, c().askPhoto);
      return;
    }
    if (action === BTN.confirm) {
      const prescriptionId = session.context?.["prescription_id"] as string | undefined;
      if (!prescriptionId) {
        await sendMenu(session.wa_phone, lang, c().fallback);
        return;
      }
      await supabaseAdmin
        .from("prescriptions")
        .update({ status: "verified" })
        .eq("id", prescriptionId);
      await patchSession(session, { state: "awaiting_location" });
      await sendLocationRequest(session.wa_phone, c().askLocation);
      return;
    }

    if (msg.type === "location" && msg.location) {
      if (session.state === "awaiting_location") {
        await handleLocation(session, lang, msg);
      } else {
        await sendMenu(session.wa_phone, lang, c().fallback);
      }
      return;
    }

    if (msg.type === "image" || msg.type === "document") {
      if (!msg.mediaId) {
        await sendText(session.wa_phone, c().unsupported);
        return;
      }
      await handlePrescriptionMedia(session, lang, msg);
      return;
    }

    if (msg.type === "text" && msg.text) {
      const t = msg.text.trim().toLowerCase();
      if (session.state === "awaiting_free_order") {
        await handleFreeOrderText(session, lang, msg.text);
        return;
      }
      if (session.state === "awaiting_rx") {
        await sendText(session.wa_phone, c().askPhoto);
        return;
      }
      if (session.state === "awaiting_location") {
        await handleNeighborhoodText(session, lang, msg.text);
        return;
      }
      if (/(suivi|track|commande|order|تتبع)/.test(t)) {
        await ensureUser(session, msg.profileName);
        await sendTracking(session, lang);
        return;
      }
      await sendMenu(session.wa_phone, lang);
      return;
    }

    await sendText(session.wa_phone, c().unsupported);
    await sendMenu(session.wa_phone, lang);
  } catch (err) {
    console.error("[whatsapp-bot]", err);
    try {
      await sendText(session.wa_phone, COPY[lang].error);
    } catch {
      /* ignore */
    }
  }
}
