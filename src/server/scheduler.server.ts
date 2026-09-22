/**
 * Tâches planifiées exécutées dans le processus Node (remplace pg_cron).
 *  - chaque heure à hh:05 : rappels de rendez-vous (send_appointment_reminders)
 *  - chaque jour à 03:15  : purge des sessions et codes expirés
 *
 * Désactivable avec SCHEDULER_ENABLED=false (ex. si plusieurs instances).
 */
import { env } from "./env.server";

const g = globalThis as unknown as { __sahaSchedulerStarted?: boolean };

function msUntil(minute: number, hour?: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(minute);
  if (hour !== undefined) next.setUTCHours(hour);
  while (next.getTime() <= now.getTime()) {
    next.setTime(next.getTime() + (hour === undefined ? 3600_000 : 86400_000));
  }
  return next.getTime() - now.getTime();
}

function every(name: string, firstDelay: () => number, period: number, task: () => Promise<void>) {
  const run = async () => {
    try {
      await task();
    } catch (err) {
      console.error(`[scheduler:${name}]`, err);
    }
  };
  const t = setTimeout(() => {
    void run();
    const i = setInterval(() => void run(), period);
    i.unref?.();
  }, firstDelay());
  t.unref?.();
}

export function startScheduler() {
  if (g.__sahaSchedulerStarted || !env.schedulerEnabled) return;
  g.__sahaSchedulerStarted = true;

  every(
    "appointment-reminders",
    () => msUntil(5),
    3600_000,
    async () => {
      const { sendAppointmentReminders } = await import("./lifecycle.server");
      await sendAppointmentReminders();
    },
  );

  every(
    "cleanup",
    () => msUntil(15, 3),
    86400_000,
    async () => {
      const { basePrisma } = await import("./prisma-base.server");
      const now = new Date();
      await basePrisma.sessions.deleteMany({ where: { expires_at: { lt: now } } });
      await basePrisma.auth_tokens.deleteMany({
        where: { expires_at: { lt: new Date(now.getTime() - 7 * 86400_000) } },
      });
      await basePrisma.whatsapp_events.deleteMany({
        where: { created_at: { lt: new Date(now.getTime() - 30 * 86400_000) } },
      });
    },
  );

  console.info("[scheduler] tâches planifiées démarrées");
}
