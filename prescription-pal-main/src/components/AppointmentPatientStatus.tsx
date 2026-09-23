import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BellRing, CheckCircle2, Clock } from "lucide-react";
import { LoadingButton } from "@/components/ui/loading-button";
import { sendAppointmentReminder, type PractitionerAppointment } from "@/lib/practitioner.functions";
import { getDateLocale } from "@/i18n";

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleString(getDateLocale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Where the patient stands: confirmed presence / confirmed consultation / waiting. */
export function PatientResponseBadge({ a }: { a: PractitionerAppointment }) {
  const { t } = useTranslation();
  let text: string | null = null;
  let ok = false;
  if (a.status === "accepted") {
    ok = true;
    text = t("prac.resp.acceptedInfo", { date: a.scheduled_at ? fmtShort(a.scheduled_at) : "—" });
  } else if (a.status === "completed") {
    ok = !!a.patient_completed_at;
    text = ok ? t("prac.resp.doneYes", { date: fmtShort(a.patient_completed_at!) }) : t("prac.resp.doneNo");
  } else if (a.status === "rescheduled") {
    text = t("prac.resp.proposalPending");
  }
  if (!text) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${ok ? "bg-emerald-500/15 text-foreground" : "bg-amber-500/15 text-foreground"}`}
      role="status"
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
      {text}
      {a.reminder_count > 0 && a.last_reminder_at && (
        <span className="text-foreground/60"> · {t("prac.resp.reminded", { count: a.reminder_count, date: fmtShort(a.last_reminder_at) })}</span>
      )}
    </span>
  );
}

/** Button that lets the practitioner send a manual reminder to the patient. */
export function RemindButton({ a, onDone, className = "" }: { a: PractitionerAppointment; onDone?: () => Promise<void> | void; className?: string }) {
  const { t } = useTranslation();
  const remind = useServerFn(sendAppointmentReminder);
  const [busy, setBusy] = useState(false);
  const eligible =
    a.status === "accepted" ||
    (a.status === "completed" && !a.patient_completed_at) ||
    a.status === "rescheduled";
  if (!eligible) return null;
  const send = async () => {
    setBusy(true);
    try {
      await remind({ data: { id: a.id } });
      toast.success(t("prac.resp.reminderSent"));
      await onDone?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <LoadingButton variant="secondary" loading={busy} onClick={send} className={`min-h-[40px] ${className}`}>
      <BellRing className="h-4 w-4" />
      {t("prac.resp.remind")}
    </LoadingButton>
  );
}
