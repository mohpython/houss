import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getPractitionerAppointment,
  saveAppointmentNotes,
  type PractitionerAppointment,
  type PrescribedItem,
} from "@/lib/practitioner.functions";
import { GlassCard } from "@/components/GlassCard";
import { PatientResponseBadge, RemindButton } from "@/components/AppointmentPatientStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingButton } from "@/components/ui/loading-button";
import { PageSkeleton } from "@/components/ui/skeletons";
import { getDateLocale } from "@/i18n";
import { ArrowLeft, CheckCircle2, Home, MessageCircle, Navigation, Phone, Pill, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/praticien/rdv/$id")({
  component: TreatPage,
  head: () => ({
    meta: [
      { title: "Fiche patient — SAHA Santé" },
      { name: "description", content: "Notes, compte-rendu et ordonnance pour la consultation en cours." },
      { property: "og:title", content: "Fiche patient — SAHA Santé" },
      { property: "og:description", content: "Traitez votre patient et clôturez la consultation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(getDateLocale(), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function TreatPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchOne = useServerFn(getPractitionerAppointment);
  const save = useServerFn(saveAppointmentNotes);

  const [a, setA] = useState<PractitionerAppointment | null>(null);
  const [history, setHistory] = useState<PractitionerAppointment[]>([]);
  const [notes, setNotes] = useState("");
  const [report, setReport] = useState("");
  const [items, setItems] = useState<PrescribedItem[]>([]);
  const [busy, setBusy] = useState<null | "save" | "complete">(null);

  const load = useCallback(async () => {
    try {
      const r = await fetchOne({ data: { id } });
      setA(r.appointment);
      setHistory(r.history);
      setNotes(r.appointment.practitioner_notes ?? "");
      setReport(r.appointment.report ?? "");
      setItems(r.appointment.prescribed_items);
    } catch (e) {
      toast.error((e as Error).message);
      navigate({ to: "/app/praticien" });
    }
  }, [fetchOne, id, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!a) return <PageSkeleton />;

  const closed = a.status === "completed" || a.status === "cancelled" || a.status === "rejected";
  const phone = a.patient_phone?.replace(/\s+/g, "");
  const triage = a.triage;

  const doSave = async (complete: boolean) => {
    const cleanItems = items.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), dosage: i.dosage?.trim() || undefined, duration: i.duration?.trim() || undefined }));
    if (complete && !report.trim()) {
      toast.error(t("prac.reportRequired"));
      return;
    }
    setBusy(complete ? "complete" : "save");
    try {
      await save({ data: { id: a.id, notes, report, prescribedItems: cleanItems, complete } });
      toast.success(complete ? t("prac.completed") : t("prac.saved"));
      if (complete) navigate({ to: "/app/praticien" });
      else await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 pb-24">
      <Link to="/app/praticien" className="inline-flex min-h-[44px] items-center gap-1 text-sm text-foreground/70 hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("prac.back")}
      </Link>

      <GlassCard featured className="mt-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl">{a.patient_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge className="border border-white/10 bg-white/10 text-foreground">{t(`appointments.status.${a.status}`, a.status)}</Badge>
              {a.at_home && <Badge className="gap-1 border border-white/10 bg-white/10 text-foreground"><Home className="h-3 w-3" />{t("prac.homeVisit")}</Badge>}
              {triage?.urgency && <Badge className="border border-amber-400/40 bg-amber-500/15 text-foreground">{String(triage.urgency)}</Badge>}
            </div>
            <p className="mt-2 text-sm">{a.reason}</p>
            <p className="mt-1 text-xs text-foreground/60">
              {t("prac.scheduledAt")} {fmt(a.scheduled_at ?? a.proposed_at)}
            </p>
            {a.at_home && a.patient_address && <p className="mt-1 text-xs text-foreground/70">📍 {a.patient_address}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PatientResponseBadge a={a} />
              <RemindButton a={a} onDone={load} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {phone && (
              <>
                <a href={`tel:${phone}`} className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-white/10 px-3 text-xs font-medium hover:bg-white/20"><Phone className="h-4 w-4" />{t("prac.call")}</a>
                <a href={`https://wa.me/${phone.replace(/^\+/, "")}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-emerald-500/15 px-3 text-xs font-medium hover:bg-emerald-500/25"><MessageCircle className="h-4 w-4" />WhatsApp</a>
              </>
            )}
            {a.at_home && a.patient_lat && a.patient_lng && (
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${a.patient_lat},${a.patient_lng}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-white/10 px-3 text-xs font-medium hover:bg-white/20"><Navigation className="h-4 w-4" />{t("prac.route")}</a>
            )}
          </div>
        </div>

        {(a.symptoms || triage?.summary) && (
          <div className="mt-4 rounded-2xl bg-white/5 p-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-foreground/50">{t("prac.symptoms")}</div>
            {a.symptoms && <p className="mt-1 whitespace-pre-wrap">{a.symptoms}</p>}
            {triage?.summary && <p className="mt-2 text-xs text-foreground/70">🤖 {String(triage.summary)}</p>}
          </div>
        )}
      </GlassCard>

      {/* Notes / report */}
      <GlassCard className="mt-4 space-y-4 p-5">
        <label className="block text-sm font-medium">
          {t("prac.privateNotes")}
          <span className="ms-1 text-xs font-normal text-foreground/50">({t("prac.privateHint")})</span>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1" disabled={closed} />
        </label>
        <label className="block text-sm font-medium">
          {t("prac.report")}
          <span className="ms-1 text-xs font-normal text-foreground/50">({t("prac.reportHint")})</span>
          <Textarea value={report} onChange={(e) => setReport(e.target.value)} rows={4} className="mt-1" disabled={closed} />
        </label>

        <div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium"><Pill className="h-4 w-4 text-primary" />{t("prac.prescription")}</span>
            {!closed && (
              <Button size="sm" variant="secondary" onClick={() => setItems([...items, { name: "" }])}><Plus className="h-4 w-4" />{t("prac.addMedicine")}</Button>
            )}
          </div>
          <p className="mt-1 text-xs text-foreground/50">{t("prac.prescriptionHint")}</p>
          <div className="mt-2 space-y-2">
            {items.length === 0 && <p className="text-xs text-foreground/50">{t("prac.noMedicine")}</p>}
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl bg-white/5 p-2 sm:grid-cols-[2fr_2fr_1fr_auto]">
                <Input placeholder={t("prac.medName")} value={it.name} disabled={closed} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Input placeholder={t("prac.medDosage")} value={it.dosage ?? ""} disabled={closed} className="col-span-2 sm:col-span-1" onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, dosage: e.target.value } : x)))} />
                <Input placeholder={t("prac.medDuration")} value={it.duration ?? ""} disabled={closed} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, duration: e.target.value } : x)))} />
                {!closed && (
                  <Button size="icon" variant="ghost" aria-label={t("common.delete", "Supprimer")} onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {!closed && (
          <div className="grid gap-2 sm:grid-cols-2">
            <LoadingButton variant="secondary" loading={busy === "save"} onClick={() => doSave(false)} className="min-h-[48px]">{t("prac.save")}</LoadingButton>
            <LoadingButton loading={busy === "complete"} onClick={() => doSave(true)} className="min-h-[48px]"><CheckCircle2 className="h-4 w-4" />{t("prac.complete")}</LoadingButton>
          </div>
        )}
        {a.status === "completed" && (
          <p className={`rounded-xl p-3 text-sm ${a.patient_completed_at ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
            {a.patient_completed_at ? t("prac.resp.doneYes", { date: fmt(a.patient_completed_at) }) : t("prac.resp.doneNoHint")}
          </p>
        )}
      </GlassCard>

      {/* History */}
      <section className="mt-6">
        <h2 className="font-semibold">{t("prac.history")}</h2>
        <div className="mt-2 space-y-2">
          {history.length === 0 && <p className="text-sm text-foreground/50">{t("prac.noHistory")}</p>}
          {history.map((h) => (
            <Link key={h.id} to="/app/praticien/rdv/$id" params={{ id: h.id }} className="block">
              <GlassCard interactive className="p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>{h.reason}</span>
                  <Badge className="border border-white/10 bg-white/10 text-foreground">{t(`appointments.status.${h.status}`, h.status)}</Badge>
                </div>
                <div className="mt-1 text-xs text-foreground/50">{fmt(h.completed_at ?? h.scheduled_at ?? h.requested_at)}</div>
                {h.report && <p className="mt-1 line-clamp-2 text-xs text-foreground/70">{h.report}</p>}
              </GlassCard>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
