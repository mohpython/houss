/**
 * Bus temps réel en mémoire (remplace Supabase Realtime).
 *
 * Les hooks de la base (lifecycle.server.ts) publient un événement à chaque
 * changement ; la route SSE `/api/realtime` le relaie aux navigateurs concernés.
 * L'application tourne en un seul processus Node (PM2, mode fork) : un
 * EventEmitter suffit.
 *
 * Les événements ne transportent que des champs non sensibles (identifiants,
 * statuts, positions) et uniquement vers les utilisateurs autorisés : le front
 * recharge ensuite les données via les server functions, qui vérifient les droits.
 */
import { EventEmitter } from "node:events";

export type RealtimeEventType = "INSERT" | "UPDATE" | "DELETE";

export type RealtimeEvent = {
  table: string;
  type: RealtimeEventType;
  /** Nouvel état (ou ancien état pour DELETE), limité aux champs publiables. */
  row: Record<string, unknown>;
  /** Utilisateurs destinataires. */
  users: string[];
  /** Diffuser aussi à tous les administrateurs. */
  admins?: boolean;
};

const g = globalThis as unknown as { __sahaRealtimeBus?: EventEmitter };
const bus = g.__sahaRealtimeBus ?? new EventEmitter();
bus.setMaxListeners(0);
g.__sahaRealtimeBus = bus;

export function publish(event: RealtimeEvent) {
  bus.emit("event", event);
}

export function onRealtimeEvent(listener: (e: RealtimeEvent) => void): () => void {
  bus.on("event", listener);
  return () => {
    bus.off("event", listener);
  };
}
