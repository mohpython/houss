/**
 * Mise à jour d'un rendez-vous au nom d'un utilisateur — server only.
 *
 * Reproduit la RLS de `appointments` (patient, praticien lié, admin) et
 * l'ancien trigger `enforce_appointment_update_columns` :
 *  - admin : aucune restriction ;
 *  - praticien : status, scheduled_at, proposed_at, notes, compte rendu,
 *    motif de refus, completed_at, prescription, rappels, triage ;
 *  - patient : annuler ou accepter la date proposée (scheduled_at = proposed_at),
 *    confirmations, coordonnées, symptômes, motif.
 *
 * Les notifications et la diffusion temps réel sont produites par les hooks
 * de `prisma` (lifecycle.server.ts).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db.server";
import { isAdmin, isUserPractitioner } from "@/server/authz.server";

type AppointmentPatch = Prisma.appointmentsUncheckedUpdateInput;

const PRACTITIONER_COLUMNS = [
  "status",
  "scheduled_at",
  "proposed_at",
  "practitioner_notes",
  "report",
  "rejection_reason",
  "completed_at",
  "prescribed_items",
  "reminders_sent",
  "last_reminder_at",
  "reminder_count",
  "triage",
];

const PATIENT_COLUMNS = [
  "status",
  "scheduled_at",
  "patient_ack_at",
  "patient_completed_at",
  "patient_phone",
  "patient_address",
  "patient_lat",
  "patient_lng",
  "symptoms",
  "reason",
];

function norm(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? v : t;
  }
  if (v && typeof v === "object") return JSON.stringify(v);
  return v ?? null;
}

function same(a: unknown, b: unknown): boolean {
  return norm(a) === norm(b);
}

export async function updateAppointmentAs(
  actorUserId: string,
  appointmentId: string,
  patch: AppointmentPatch,
) {
  const old = await prisma.appointments.findUnique({ where: { id: appointmentId } });
  if (!old) throw new Error("Rendez-vous introuvable.");

  if (!(await isAdmin(actorUserId))) {
    const oldRow = old as unknown as Record<string, unknown>;
    const next = patch as Record<string, unknown>;
    const changed = Object.keys(next).filter(
      (k) => k !== "updated_at" && next[k] !== undefined && !same(oldRow[k], next[k]),
    );

    if (changed.length > 0) {
      const isPatient = old.patient_id === actorUserId;
      const isPract = await isUserPractitioner(actorUserId, old.practitioner_id);
      if (!isPatient && !isPract) throw new Error("Non autorisé à modifier ce rendez-vous.");

      const allowed = new Set<string>();
      if (isPract) PRACTITIONER_COLUMNS.forEach((c) => allowed.add(c));
      if (isPatient) {
        PATIENT_COLUMNS.forEach((c) => allowed.add(c));
        if (!isPract) {
          if (
            changed.includes("status") &&
            !(
              next.status === "cancelled" ||
              (old.status === "rescheduled" && next.status === "accepted")
            )
          ) {
            throw new Error("Le patient ne peut qu'annuler ou accepter une date proposée.");
          }
          if (changed.includes("scheduled_at") && !same(next.scheduled_at, old.proposed_at)) {
            throw new Error("La date doit être celle proposée par le praticien.");
          }
        }
      }

      const bad = changed.filter((c) => !allowed.has(c));
      if (bad.length > 0) {
        throw new Error(`Modification non autorisée des champs: ${bad.join(", ")}`);
      }
    }
  }

  return prisma.appointments.update({
    where: { id: appointmentId },
    data: patch,
    select: { id: true },
  });
}
