import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { toPlain } from "@/server/serialize";

/** Public web-push configuration (all values are publishable Firebase identifiers). */
export const getPushWebConfig = createServerFn({ method: "GET" }).handler(async () => {
  const apiKey = process.env.FIREBASE_API_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const senderId = process.env.FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.FIREBASE_APP_ID;
  const vapidKey = process.env.FIREBASE_VAPID_KEY;

  if (!apiKey || !projectId || !senderId || !appId || !vapidKey) {
    return { configured: false as const };
  }

  return {
    configured: true as const,
    apiKey,
    projectId,
    senderId,
    appId,
    vapidKey,
    authDomain: `${projectId}.firebaseapp.com`,
    storageBucket: `${projectId}.appspot.com`,
  };
});

export const registerDeviceToken = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input) =>
    z
      .object({
        token: z.string().min(20).max(4096),
        platform: z.enum(["android", "ios", "web"]),
        language: z.enum(["fr", "en", "ar"]).default("fr"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    // Le jeton push appartient a l'appareil, pas a la personne. Sur un poste
    // partage (ou apres une reconnexion avec un autre compte) FCM renvoie le meme
    // jeton : on le rattache au compte qui se connecte, sinon ce nouveau compte
    // ne recevrait plus aucune notification.
    const existing = await prisma.device_tokens.findUnique({
      where: { token: data.token },
      select: { user_id: true },
    });
    if (existing && existing.user_id !== context.userId) {
      console.warn(
        `[devices] jeton web rattache a un nouveau compte (precedent ${existing.user_id} -> ${context.userId})`,
      );
    }
    await prisma.device_tokens.upsert({
      where: { token: data.token },
      create: {
        user_id: context.userId,
        token: data.token,
        platform: data.platform,
        language: data.language,
      },
      update: {
        user_id: context.userId,
        platform: data.platform,
        language: data.language,
        updated_at: new Date(),
      },
    });
    return { ok: true };
  });

export const unregisterDeviceToken = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input) => z.object({ token: z.string().min(20).max(4096) }).parse(input))
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    await prisma.device_tokens.deleteMany({
      where: { token: data.token, user_id: context.userId },
    });
    return { ok: true };
  });

export const listMyDevices = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { prisma } = await import("@/server/db.server");
    const data = await prisma.device_tokens.findMany({
      where: { user_id: context.userId },
      select: { id: true, platform: true, created_at: true },
      orderBy: { created_at: "desc" },
    });
    return toPlain(data);
  });
