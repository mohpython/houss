import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  cancelAppointment,
  listMyAppointments,
  patientConfirmAppointment,
  patientRespondToProposal,
} from "@/lib/practitioner.functions";
import { GlassCard } from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { ListSkeleton } from "@/components/ui/skeletons";
import { CalendarDays, CheckCircle2, Pill, ShoppingBag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/appointments/")({
  head: () => ({
    meta: [
      { title: "Mes rendez-vous — SAHA Santé" },
      {
        name: "description",
        content: "Suivez vos demandes de consultation et de soins à domicile.",
      },
      { property: "og:title", content: "Mes rendez-vous — SAHA Santé" },
      {
        property: "og:description",
        content: "Suivez vos demandes de consultation et de soins à domicile.",
      },
    ],
  }),
  component: Appointments,
});

type Item = { name: string; dosage?: string; duration?: string };
type Row = {
  id: string;
  reason: string;
  status: string;
  at_home: boolean;
  created_at: string;
  scheduled_at: string | null;
  proposed_at: string | null;
  report: string | null;
  rejection_reason: string | null;
  prescribed_items: Item[] | null;
  patient_completed_at: string | null;
  practitioners: { full_name: string; type: string; phone: string | null } | null;
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(getDateLocale(), {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function Appointments() {
  const { t } = useTranslation();
  const { user } = Route.useRouteContext();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const respond = useServerFn(patientRespondToProposal);
  const cancel = useServerFn(cancelAppointment);
  const confirm = useServerFn(patientConfirmAppointment);
  const listMine = useServerFn(listMyAppointments);

  const load = useCallback(() => {
    listMine()
      .then((data) => setRows((data as unknown as Row[]) ?? []))
      .catch(() => setRows([]));
  }, [user.id, listMine]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-3xl">{t("appointments.title")}</h1>
      <p className="mt-1 text-sm text-foreground/70">{t("appointments.subtitle")}</p>

      <div className="mt-6 space-y-3">
        {rows === null && <ListSkeleton rows={3} />}
        {rows?.length === 0 && (
          <GlassCard className="p-8 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-foreground/50" />
            <p className="mt-2 text-sm text-foreground/60">{t("appointments.empty")}</p>
            <Link
              to="/app/health"
              className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
            >
              {t("appointments.findPractitioner")}
            </Link>
          </GlassCard>
        )}
        {rows?.map((a) => {
          const name =
            a.practitioners?.type === "doctor"
              ? `Dr. ${a.practitioners?.full_name}`
              : (a.practitioners?.full_name ?? "—");
          const open = !["completed", "cancelled", "rejected"].includes(a.status);
          const items = Array.isArray(a.prescribed_items) ? a.prescribed_items : [];
          return (
            <GlassCard key={a.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{name}</div>
                  <div className="mt-0.5 text-xs text-foreground/60">{a.reason}</div>
                  <div className="mt-1 text-xs text-foreground/50">
                    {fmt(a.scheduled_at ?? a.proposed_at ?? a.created_at)}
                    {a.at_home ? ` · ${t("appointments.atHome")}` : ""}
                  </div>
                </div>
                <Badge className="border border-white/10 bg-white/10 text-foreground">
                  {t(`appointments.status.${a.status}`, a.status)}
                </Badge>
              </div>

              {a.status === "rescheduled" && a.proposed_at && (
                <div className="mt-3 rounded-2xl bg-primary/10 p-3 text-sm">
                  <p>{t("appointments.proposal", { name, date: fmt(a.proposed_at) })}</p>
                  <div className="mt-2 flex gap-2">
                    <LoadingButton
                      loading={busy === a.id + "ok"}
                      className="min-h-[44px] flex-1"
                      onClick={() =>
                        act(
                          a.id + "ok",
                          () => respond({ data: { id: a.id, accept: true } }),
                          t("appointments.proposalAccepted"),
                        )
                      }
                    >
                      {t("appointments.acceptDate")}
                    </LoadingButton>
                    <LoadingButton
                      variant="secondary"
                      loading={busy === a.id + "no"}
                      className="min-h-[44px] flex-1"
                      onClick={() =>
                        act(
                          a.id + "no",
                          () => respond({ data: { id: a.id, accept: false } }),
                          t("appointments.cancelled"),
                        )
                      }
                    >
                      {t("appointments.refuseDate")}
                    </LoadingButton>
                  </div>
                </div>
              )}

              {a.status === "rejected" && a.rejection_reason && (
                <p className="mt-2 text-xs text-foreground/70">
                  {t("appointments.reason")} : {a.rejection_reason}
                </p>
              )}

              {a.status === "accepted" && (
                <p className="mt-3 flex items-center gap-1 text-xs text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t("appointments.acceptedInfo", {
                    name,
                    date: a.scheduled_at ? fmt(a.scheduled_at) : "",
                  })}
                </p>
              )}

              {a.status === "completed" &&
                (a.patient_completed_at ? (
                  <p className="mt-3 flex items-center gap-1 text-xs text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t("appointments.completionConfirmed")}
                  </p>
                ) : (
                  <div className="mt-3 rounded-2xl bg-primary/10 p-3 text-sm">
                    <p>{t("appointments.confirmCompletionHint", { name })}</p>
                    <LoadingButton
                      loading={busy === a.id + "done"}
                      className="mt-2 min-h-[44px] w-full"
                      onClick={() =>
                        act(
                          a.id + "done",
                          () => confirm({ data: { id: a.id, kind: "completed" } }),
                          t("appointments.completionConfirmed"),
                        )
                      }
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {t("appointments.confirmCompletion")}
                    </LoadingButton>
                  </div>
                ))}

              {a.status === "completed" && a.report && (
                <div className="mt-3 rounded-2xl bg-white/5 p-3 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                    {t("appointments.report")}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{a.report}</p>
                </div>
              )}

              {a.status === "completed" && items.length > 0 && (
                <div className="mt-3 rounded-2xl bg-emerald-500/10 p-3 text-sm">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground/60">
                    <Pill className="h-3.5 w-3.5" />
                    {t("appointments.prescription")}
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {items.map((it, i) => (
                      <li key={i}>
                        • {it.name}
                        {it.dosage ? ` — ${it.dosage}` : ""}
                        {it.duration ? ` (${it.duration})` : ""}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/app/otc"
                    search={{ q: items.map((i) => i.name).join(", ") }}
                    className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    {t("appointments.orderMedicines")}
                  </Link>
                </div>
              )}

              {open && a.status !== "rescheduled" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 min-h-[40px] text-foreground/60"
                  disabled={busy === a.id}
                  onClick={() =>
                    act(a.id, () => cancel({ data: { id: a.id } }), t("appointments.cancelled"))
                  }
                >
                  {t("appointments.cancel")}
                </Button>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
