/**
 * Envoi d'une notification push (FCM) pour une notification in-app.
 * Remplace le trigger PostgreSQL + pg_net qui appelait /api/public/push/dispatch.
 */
import { basePrisma } from "./prisma-base.server";
import { getServiceAccount, sendToToken } from "@/lib/push.server";
import { pushCopy, pushLink } from "@/lib/push-messages";

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
};

export async function dispatchPush(notif: NotificationRow): Promise<void> {
  const sa = getServiceAccount();
  if (!sa) return;

  const tokens = await basePrisma.device_tokens.findMany({
    where: { user_id: notif.user_id },
    select: { token: true, language: true },
  });
  if (tokens.length === 0) return;

  const data = (notif.data ?? {}) as Record<string, unknown>;
  const link = pushLink(notif.type, data);

  const results = await Promise.all(
    tokens.map((row) => {
      const copy = pushCopy(notif.type, row.language, { title: notif.title, body: notif.body });
      return sendToToken(sa, row.token, {
        ...copy,
        link,
        tag: typeof data.reservation_id === "string" ? data.reservation_id : notif.id,
      }).catch(() => ({ token: row.token, ok: false, invalid: false }));
    }),
  );

  const stale = results.filter((r) => r.invalid).map((r) => r.token);
  if (stale.length > 0) {
    await basePrisma.device_tokens.deleteMany({ where: { token: { in: stale } } });
  }
}
