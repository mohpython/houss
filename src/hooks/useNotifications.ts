import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { listMyNotifications, markNotificationsRead } from "@/lib/account.functions";
import { subscribeRealtime } from "@/integrations/realtime/client";

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export function useNotifications(userId: string | null) {
  const [items, setItems] = useState<Notification[]>([]);
  const { t } = useTranslation();

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await listMyNotifications();
      setItems((data ?? []) as Notification[]);
    } catch {
      /* hors ligne : on garde la liste actuelle */
    }
  }, [userId]);

  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    if (!userId) return;
    fetchAll();
    return subscribeRealtime(
      [{ table: "notifications", event: "INSERT", filter: { user_id: userId } }],
      (payload) => {
        const n = payload.new as unknown as Notification;
        setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev]));
        const title = tRef.current(`notif.${n.type}.title`, {
          defaultValue: n.title || "Notification",
        });
        const body = tRef.current(`notif.${n.type}.body`, { defaultValue: n.body || "" });
        toast(title, { description: body });
      },
      { onResync: () => void fetchAll() },
    );
  }, [userId, fetchAll]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await markNotificationsRead({ data: { all: true } });
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  }, [userId]);

  const markRead = useCallback(async (id: string) => {
    await markNotificationsRead({ data: { id } });
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)),
    );
  }, []);

  const unreadCount = items.filter((n) => !n.read_at).length;

  return { items, unreadCount, markAllRead, markRead, refresh: fetchAll };
}
