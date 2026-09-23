import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getMyPractitionerDashboard,
  respondToAppointment,
  setPractitionerAvailability,
  type PractitionerAppointment,
  type PractitionerDashboard,
} from "@/lib/practitioner.functions";
import { GlassCard } from "@/components/GlassCard";
import { PatientResponseBadge, RemindButton } from "@/components/AppointmentPatientStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageSkeleton } from "@/components/ui/skeletons";
import { getDateLocale } from "@/i18n";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock,
  Home,
  MessageCircle,
  Navigation,
  Phone,
  Stethoscope,
  Users,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/praticien/")({
  component: PractitionerDashboardPage,
  head: () => ({
    meta: [
      { title: "Espace praticien — SAHA Santé" },
      { name: "description", content: "Demandes de consultation, agenda, rappels et suivi de vos patients." },
      { property: "og:title", content: "Espace praticien — SAHA Santé" },
      { property: "og:description", content: "Acceptez vos demandes, proposez une date et traitez vos patients." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(getDateLocale(), {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function PractitionerDashboardPage() {
  const { t } = useTranslation();
  const [dash, setDash] = useState<PractitionerDashboard | null>(null);
  const [tab, setTab] = useState<"requests" | "agenda" | "done" | "patients">("requests");
  const [toggling, setToggling] = useState(false);
  const load = useServerFn(getMyPractitionerDashboard);
  const setAvail = useServerFn(setPractitionerAvailability);

  const refresh = useCallback(async () => {
    try {
      setDash(await load());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const reminders = useMemo(() => {
    if (!dash) return { today: [], soon: [], stale: [] as PractitionerAppointment[] };
    const now = Date.now();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = start.getTime() + 86_400_000;
    const today: PractitionerAppointment[] = [];
    const soon: PractitionerAppointment[] = [];
    const stale: PractitionerAppointment[] = [];
    for (const a of dash.appointments) {
      if (a.status === "accepted" && a.scheduled_at) {
        const ts = new Date(a.scheduled_at).getTime();
        if (ts >= start.getTime() && ts < end) today.push(a);
        else if (ts >= end && ts < now + 48 * 3_600_000) soon.push(a);
      }
      if (a.status === "requested" && now - new Date(a.requested_at).getTime() > 2 * 3_600_000) stale.push(a);
    }
    today.sort((x, y) => (x.scheduled_at! < y.scheduled_at! ? -1 : 1));
    soon.sort((x, y) => (x.scheduled_at! < y.scheduled_at! ? -1 : 1));
    return { today, soon, stale };
  }, [dash]);

  if (!dash) return <PageSkeleton />;

  if (!dash.me) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <GlassCard className="p-8 text-center">
          <Stethoscope className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-3 font-display text-2xl">{t("prac.title")}</h1>
          <p className="mt-2 text-sm text-foreground/70">{t("prac.noProfile")}</p>
        </GlassCard>
      </div>
    );
  }

  const me = dash.me;
  const list = dash.appointments.filter((a) =>
    tab === "requests"
      ? a.status === "requested" || a.status === "rescheduled"
      : tab === "agenda"
        ? a.status === "accepted"
        : tab === "done"
          ? a.status === "completed" || a.status === "rejected" || a.status === "cancelled"
          : false,
  );
  if (tab === "agenda") list.sort((x, y) => ((x.scheduled_at ?? "") < (y.scheduled_at ?? "") ? -1 : 1));

  // Patients grouped from all appointments
  const patients = (() => {
    const map = new Map<string, { id: string; name: string; phone: string | null; total: number; completed: number; pending: number; unconfirmed: number; last: PractitionerAppointment; next: PractitionerAppointment | null }>();
    for (const a of dash.appointments) {
      const p = map.get(a.patient_id) ?? { id: a.patient_id, name: a.patient_name, phone: a.patient_phone, total: 0, completed: 0, pending: 0, unconfirmed: 0, last: a, next: null };
      p.total++;
      if (a.status === "completed") { p.completed++; if (!a.patient_completed_at) p.unconfirmed++; }
      if (a.status === "requested" || a.status === "rescheduled") p.pending++;
      if (a.status === "accepted" && a.scheduled_at && new Date(a.scheduled_at).getTime() > Date.now() && (!p.next || a.scheduled_at < p.next.scheduled_at!)) p.next = a;
      if (a.requested_at > p.last.requested_at) p.last = a;
      map.set(a.patient_id, p);
    }
    return Array.from(map.values()).sort((x, y) => (x.last.requested_at < y.last.requested_at ? 1 : -1));
  })();

  const onToggle = async (v: boolean) => {
    setToggling(true);
    try {
      await setAvail({ data: { available: v } });
      setDash({ ...dash, me: { ...me, is_available: v } });
      toast.success(v ? t("prac.nowAvailable") : t("prac.nowUnavailable"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setToggling(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 pb-24" aria-labelledby="prac-title">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="prac-title" className="font-display text-3xl">
            {me.type === "doctor" ? `Dr ${me.full_name}` : me.full_name}
          </h1>
          <p className="text-sm text-foreground/60">{t("prac.subtitle")}</p>
        </div>
        <label className="flex min-h-[44px] items-center gap-3 rounded-2xl bg-white/5 px-4 ring-1 ring-white/10">
          <span className="text-sm font-medium">{me.is_available ? t("prac.available") : t("prac.unavailable")}</span>
          <Switch checked={me.is_available} disabled={toggling} onCheckedChange={onToggle} aria-label={t("prac.available")} />
        </label>
      </header>

      {/* KPIs */}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={t("prac.kpis")}>
        <Kpi icon={<Bell className="h-5 w-5" />} label={t("prac.kpiRequests")} value={dash.counts.requested} tone="warn" onClick={() => setTab("requests")} />
        <Kpi icon={<Clock className="h-5 w-5" />} label={t("prac.kpiToday")} value={dash.counts.today} onClick={() => setTab("agenda")} />
        <Kpi icon={<CalendarDays className="h-5 w-5" />} label={t("prac.kpiUpcoming")} value={dash.counts.upcoming} onClick={() => setTab("agenda")} />
        <Kpi icon={<CheckCircle2 className="h-5 w-5" />} label={t("prac.kpiDone")} value={dash.counts.completed} onClick={() => setTab("done")} />
      </section>

      {/* Reminders */}
      {(reminders.today.length > 0 || reminders.soon.length > 0 || reminders.stale.length > 0) && (
        <GlassCard featured className="mt-5 p-4" role="region" aria-label={t("prac.reminders")}>
          <h2 className="flex items-center gap-2 font-semibold">
            <Bell className="h-4 w-4 text-primary" /> {t("prac.reminders")}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {reminders.stale.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-3 py-2">
                <span>
                  ⏳ {t("prac.staleRequest", { name: a.patient_name, hours: Math.floor((Date.now() - new Date(a.requested_at).getTime()) / 3_600_000) })}
                </span>
                <Button size="sm" variant="secondary" onClick={() => setTab("requests")}>{t("prac.answer")}</Button>
              </li>
            ))}
            {reminders.today.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl bg-primary/10 px-3 py-2">
                <span>📅 {t("prac.todayAt", { time: new Date(a.scheduled_at!).toLocaleTimeString(getDateLocale(), { hour: "2-digit", minute: "2-digit" }), name: a.patient_name })}{a.at_home ? ` · ${t("prac.homeVisit")}` : ""}</span>
                <div className="flex gap-1">
                  {a.at_home && a.patient_lat && a.patient_lng && <RouteBtn a={a} />}
                  <Link to="/app/praticien/rdv/$id" params={{ id: a.id }} className="inline-flex min-h-[36px] items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground">{t("prac.open")}</Link>
                </div>
              </li>
            ))}
            {reminders.soon.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2">
                <span>🔔 {fmt(a.scheduled_at)} — {a.patient_name}{a.at_home ? ` · ${t("prac.homeVisit")}` : ""}</span>
                <Link to="/app/praticien/rdv/$id" params={{ id: a.id }} className="text-xs font-medium text-primary hover:underline">{t("prac.open")}</Link>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {/* Tabs */}
      <nav className="mt-6 grid grid-cols-4 gap-2" aria-label={t("prac.sections")}>
        {(["requests", "agenda", "patients", "done"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={`min-h-[48px] rounded-2xl px-1 text-sm font-semibold ring-1 transition ${tab === k ? "bg-primary text-primary-foreground ring-primary" : "bg-white/5 ring-white/10 hover:bg-white/10"}`}
          >
            {t(`prac.tab.${k}`)}
          </button>
        ))}
      </nav>

      {tab === "patients" ? (
        <section className="mt-4 space-y-3" aria-label={t("prac.tab.patients")}>
          {patients.length === 0 && (
            <GlassCard className="p-8 text-center text-sm text-foreground/60">{t("prac.emptyList")}</GlassCard>
          )}
          {patients.map((p) => {
            const phone = p.phone?.replace(/\s+/g, "");
            const focus = p.next ?? p.last;
            return (
              <GlassCard key={p.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-primary" />{p.name}</div>
                    <div className="mt-1 text-xs text-foreground/60">
                      {t("prac.patients.stats", { total: p.total, completed: p.completed })}
                      {p.pending > 0 && <> · <span className="text-amber-300">{t("prac.patients.pending", { count: p.pending })}</span></>}
                      {p.unconfirmed > 0 && <> · <span className="text-amber-300">{t("prac.patients.unconfirmed", { count: p.unconfirmed })}</span></>}
                    </div>
                    <div className="mt-1 text-xs text-foreground/50">
                      {p.next ? <>{t("prac.patients.next")} {fmt(p.next.scheduled_at)}</> : <>{t("prac.patients.last")} {fmt(p.last.completed_at ?? p.last.scheduled_at ?? p.last.requested_at)}</>}
                    </div>
                    <div className="mt-2"><PatientResponseBadge a={focus} /></div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {phone && (
                      <a href={`tel:${phone}`} className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-white/10 px-3 text-xs font-medium hover:bg-white/20"><Phone className="h-4 w-4" />{t("prac.call")}</a>
                    )}
                    <RemindButton a={focus} onDone={refresh} />
                    <Link to="/app/praticien/rdv/$id" params={{ id: focus.id }} className="inline-flex min-h-[40px] items-center rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground">{t("prac.viewFile")}</Link>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </section>
      ) : (
        <section className="mt-4 space-y-3">
          {list.length === 0 && (
            <GlassCard className="p-8 text-center text-sm text-foreground/60">{t("prac.emptyList")}</GlassCard>
          )}
          {list.map((a) => (
            <AppointmentCard key={a.id} a={a} onChanged={refresh} />
          ))}
        </section>
      )}
    </main>
  );
}

function Kpi({ icon, label, value, tone, onClick }: { icon: React.ReactNode; label: string; value: number; tone?: "warn"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`glass flex min-h-[84px] flex-col justify-between rounded-2xl p-3 text-start ring-1 transition hover:ring-primary/50 ${tone === "warn" && value > 0 ? "ring-amber-400/50" : "ring-white/10"}`}
    >
      <span className="flex items-center gap-2 text-xs text-foreground/70">{icon}{label}</span>
      <span className="font-display text-3xl">{value}</span>
    </button>
  );
}

function RouteBtn({ a }: { a: PractitionerAppointment }) {
  const { t } = useTranslation();
  const href = `https://www.google.com/maps/dir/?api=1&destination=${a.patient_lat},${a.patient_lng}`;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-white/10 px-3 text-xs font-medium hover:bg-white/20">
      <Navigation className="h-3.5 w-3.5" /> {t("prac.route")}
    </a>
  );
}

function AppointmentCard({ a, onChanged }: { a: PractitionerAppointment; onChanged: () => Promise<void> }) {
  const { t } = useTranslation();
  const respond = useServerFn(respondToAppointment);
  const [mode, setMode] = useState<null | "accept" | "reschedule" | "reject">(null);
  const [at, setAt] = useState(() => toLocalInput(new Date(Date.now() + 3_600_000)));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!mode) return;
    setBusy(true);
    try {
      await respond({
        data: {
          id: a.id,
          action: mode,
          at: mode === "reject" ? null : new Date(at).toISOString(),
          reason: mode === "reject" ? reason : null,
        },
      });
      toast.success(t(`prac.done.${mode}`));
      setMode(null);
      await onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const open = a.status === "requested" || a.status === "rescheduled";
  const phone = a.patient_phone?.replace(/\s+/g, "");
  const triage = a.triage;

  return (
    <GlassCard className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{a.patient_name}</span>
            <Badge className="border border-white/10 bg-white/10 text-foreground">{t(`appointments.status.${a.status}`, a.status)}</Badge>
            {a.at_home && <Badge className="gap-1 border border-white/10 bg-white/10 text-foreground"><Home className="h-3 w-3" />{t("prac.homeVisit")}</Badge>}
            {triage?.urgency && <Badge className="border border-amber-400/40 bg-amber-500/15 text-foreground">{String(triage.urgency)}</Badge>}
          </div>
          <div className="mt-1 text-sm">{a.reason}</div>
          {a.symptoms && <p className="mt-1 line-clamp-3 text-xs text-foreground/70">{a.symptoms}</p>}
          <div className="mt-1 text-xs text-foreground/50">
            {t("prac.requestedAt")} {fmt(a.requested_at)}
            {a.scheduled_at && <> · {t("prac.scheduledAt")} {fmt(a.scheduled_at)}</>}
            {!a.scheduled_at && a.proposed_at && <> · {t("prac.proposedAt")} {fmt(a.proposed_at)}</>}
          </div>
          {a.at_home && a.patient_address && <div className="mt-1 text-xs text-foreground/70">📍 {a.patient_address}</div>}
          <div className="mt-2"><PatientResponseBadge a={a} /></div>
        </div>
        <div className="flex flex-wrap gap-1">
          {phone && (
            <>
              <a href={`tel:${phone}`} className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-white/10 px-3 text-xs font-medium hover:bg-white/20" aria-label={t("prac.call")}><Phone className="h-4 w-4" />{t("prac.call")}</a>
              <a href={`https://wa.me/${phone.replace(/^\+/, "")}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-emerald-500/15 px-3 text-xs font-medium hover:bg-emerald-500/25" aria-label="WhatsApp"><MessageCircle className="h-4 w-4" />WhatsApp</a>
            </>
          )}
          {a.at_home && a.patient_lat && a.patient_lng && <RouteBtn a={a} />}
          <RemindButton a={a} onDone={onChanged} />
        </div>
      </div>

      {open && !mode && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button className="min-h-[44px]" onClick={() => setMode("accept")}><CheckCircle2 className="h-4 w-4" />{t("prac.accept")}</Button>
          <Button variant="secondary" className="min-h-[44px]" onClick={() => setMode("reschedule")}><CalendarDays className="h-4 w-4" />{t("prac.propose")}</Button>
          <Button variant="destructive" className="min-h-[44px]" onClick={() => setMode("reject")}><XCircle className="h-4 w-4" />{t("prac.reject")}</Button>
        </div>
      )}

      {mode && (
        <div className="mt-3 space-y-2 rounded-2xl bg-white/5 p-3">
          {mode !== "reject" ? (
            <label className="block text-sm">
              {mode === "accept" ? t("prac.pickDate") : t("prac.pickNewDate")}
              <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="mt-1 min-h-[44px]" />
            </label>
          ) : (
            <label className="block text-sm">
              {t("prac.rejectReason")}
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1" />
            </label>
          )}
          <div className="flex gap-2">
            <LoadingButton loading={busy} onClick={submit} className="min-h-[44px] flex-1">{t("common.confirm", "Confirmer")}</LoadingButton>
            <Button variant="ghost" onClick={() => setMode(null)} className="min-h-[44px]">{t("common.cancel", "Annuler")}</Button>
          </div>
        </div>
      )}

      {(a.status === "accepted" || a.status === "completed") && (
        <Link to="/app/praticien/rdv/$id" params={{ id: a.id }} className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl bg-primary/15 text-sm font-semibold text-primary ring-1 ring-primary/30 hover:bg-primary/25">
          <Stethoscope className="me-2 h-4 w-4" />
          {a.status === "completed" ? t("prac.viewFile") : t("prac.treat")}
        </Link>
      )}
    </GlassCard>
  );
}
