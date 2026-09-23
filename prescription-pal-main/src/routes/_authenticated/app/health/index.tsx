import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listSpecialties,
  triageAndMatch,
  searchPractitioners,
  requestAppointment,
  type MatchedPractitioner,
  type SpecialtyRow,
  type Triage,
} from "@/lib/health.functions";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Stethoscope,
  Syringe,
  Loader2,
  MapPin,
  Phone,
  Home,
  CalendarPlus,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/app/health/")({
  head: () => ({
    meta: [
      { title: "Consultation — SAHA Santé" },
      {
        name: "description",
        content:
          "Décrivez vos symptômes : l'IA vous oriente vers le médecin ou l'infirmier le plus proche pour un rendez-vous.",
      },
      { property: "og:title", content: "Consultation — SAHA Santé" },
      {
        property: "og:description",
        content: "Orientation médicale par IA et prise de rendez-vous avec un praticien proche.",
      },
    ],
  }),
  component: HealthPage,
});

function HealthPage() {
  const { t, i18n } = useTranslation();
  const specialtiesFn = useServerFn(listSpecialties);
  const triageFn = useServerFn(triageAndMatch);
  const searchFn = useServerFn(searchPractitioners);
  const bookFn = useServerFn(requestAppointment);

  const [specs, setSpecs] = useState<SpecialtyRow[] | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [homeOnly, setHomeOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [triage, setTriage] = useState<Triage | null>(null);
  const [list, setList] = useState<MatchedPractitioner[] | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);

  const [bookingId, setBookingId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [preferredAt, setPreferredAt] = useState("");
  const [atHome, setAtHome] = useState(false);
  const [bookBusy, setBookBusy] = useState(false);

  useEffect(() => {
    specialtiesFn({}).then(setSpecs).catch(() => setSpecs([]));
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setGeo(null),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    }
  }, [specialtiesFn]);

  const label = (s: SpecialtyRow) =>
    i18n.language === "ar" ? s.label_ar : i18n.language === "en" ? s.label_en : s.label_fr;

  const runTriage = async () => {
    if (symptoms.trim().length < 5) {
      toast.error(t("health.describeMore"));
      return;
    }
    setBusy(true);
    setTriage(null);
    setList(null);
    try {
      const r = await triageFn({
        data: {
          symptoms,
          language: i18n.language,
          lat: geo?.lat ?? null,
          lng: geo?.lng ?? null,
          homeVisitOnly: homeOnly,
        },
      });
      setTriage(r.triage);
      setList(r.practitioners);
      setAtHome(homeOnly || r.triage.practitioner_type === "nurse");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("health.triageError"));
    } finally {
      setBusy(false);
    }
  };

  const bySpecialty = async (code: string, type: "doctor" | "nurse") => {
    setBusy(true);
    setTriage(null);
    try {
      const r = await searchFn({
        data: {
          specialtyCode: code,
          type,
          lat: geo?.lat ?? null,
          lng: geo?.lng ?? null,
          homeVisitOnly: homeOnly,
        },
      });
      setList(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("health.triageError"));
    } finally {
      setBusy(false);
    }
  };

  const book = async (p: MatchedPractitioner) => {
    setBookBusy(true);
    try {
      await bookFn({
        data: {
          practitionerId: p.id,
          symptoms: symptoms || undefined,
          reason: triage?.summary?.slice(0, 300) || t("health.consultation"),
          atHome: atHome && p.home_visits,
          patientAddress: address || null,
          patientPhone: phone || null,
          patientLat: geo?.lat ?? null,
          patientLng: geo?.lng ?? null,
          preferredAt: preferredAt ? new Date(preferredAt).toISOString() : null,
          triage: triage ? (triage as unknown as Record<string, unknown>) : null,
        },
      });
      toast.success(t("health.booked", { name: p.full_name }));
      setBookingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("health.bookError"));
    } finally {
      setBookBusy(false);
    }
  };

  const urgencyTone: Record<string, string> = {
    low: "bg-success/10 text-success border-success/30",
    medium: "bg-warning/10 text-warning border-warning/30",
    high: "bg-destructive/10 text-destructive border-destructive/30",
    emergency: "bg-destructive/20 text-destructive border-destructive/50",
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">{t("health.title")}</h1>
          <p className="mt-1 text-sm text-foreground/70">{t("health.subtitle")}</p>
        </div>
        <Link to="/app/appointments" className="text-sm text-primary hover:underline">
          {t("health.myAppointments")}
        </Link>
      </div>

      <GlassCard className="mt-6 p-5">
        <label className="text-xs uppercase tracking-widest text-foreground/60">
          {t("health.symptomsLabel")}
        </label>
        <Textarea
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
          rows={4}
          placeholder={t("health.symptomsPlaceholder")}
          className="mt-2"
        />
        <label className="mt-3 flex items-center gap-2 text-sm text-foreground/70">
          <Checkbox checked={homeOnly} onCheckedChange={(v) => setHomeOnly(!!v)} />
          {t("health.homeOnly")}
        </label>
        <Button className="mt-4 w-full" size="lg" onClick={runTriage} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {t("health.analyze")}
        </Button>
        {!geo && (
          <p className="mt-2 text-xs text-foreground/50">{t("health.geoHint")}</p>
        )}
      </GlassCard>

      {triage && (
        <GlassCard className="mt-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className={`border ${urgencyTone[triage.urgency] ?? ""}`}>
              {t(`health.urgency.${triage.urgency}`)}
            </Badge>
            <Badge variant="secondary" className="border border-white/10 bg-white/5">
              {triage.practitioner_type === "nurse" ? (
                <Syringe className="mr-1 h-3 w-3" />
              ) : (
                <Stethoscope className="mr-1 h-3 w-3" />
              )}
              {specs?.find((s) => s.code === triage.specialty_code)
                ? label(specs.find((s) => s.code === triage.specialty_code)!)
                : triage.specialty_code}
            </Badge>
          </div>
          <p className="mt-3 text-sm">{triage.summary}</p>
          <p className="mt-2 text-sm text-foreground/70">{triage.advice}</p>
          {triage.possible_conditions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {triage.possible_conditions.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-foreground/70"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
          {(triage.urgency === "emergency" || triage.urgency === "high") && (
            <div className="mt-3 flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t("health.emergencyNotice")}
            </div>
          )}
          <p className="mt-3 text-[11px] text-foreground/50">{t("health.disclaimer")}</p>
        </GlassCard>
      )}

      <section className="mt-8">
        <h2 className="font-display text-xl">{t("health.browseSpecialties")}</h2>
        {specs === null && <Skeleton className="mt-3 h-20 w-full" />}
        <div className="mt-3 flex flex-wrap gap-2">
          {specs?.map((s) => (
            <button
              key={s.code}
              onClick={() => bySpecialty(s.code, s.practitioner_type)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs transition hover:border-primary hover:text-primary"
            >
              {s.practitioner_type === "nurse" ? "💉 " : "🩺 "}
              {label(s)}
            </button>
          ))}
        </div>
      </section>

      {list && (
        <section className="mt-8">
          <h2 className="font-display text-xl">{t("health.practitioners")}</h2>
          {list.length === 0 && (
            <GlassCard className="mt-3 p-6 text-center text-sm text-foreground/60">
              {t("health.noPractitioner")}
            </GlassCard>
          )}
          <div className="mt-3 space-y-3">
            {list.map((p) => (
              <GlassCard key={p.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold">
                      {p.type === "nurse" ? (
                        <Syringe className="h-4 w-4 text-accent" />
                      ) : (
                        <Stethoscope className="h-4 w-4 text-primary" />
                      )}
                      {p.type === "doctor" ? `Dr. ${p.full_name}` : p.full_name}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/60">
                      {specs?.find((s) => s.code === p.specialty_code) && (
                        <span>{label(specs.find((s) => s.code === p.specialty_code)!)}</span>
                      )}
                      {p.distanceKm !== null && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {p.distanceKm} km
                        </span>
                      )}
                      {p.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {p.phone}
                        </span>
                      )}
                      {p.home_visits && (
                        <span className="inline-flex items-center gap-1 text-success">
                          <Home className="h-3 w-3" />
                          {t("health.homeVisits")}
                        </span>
                      )}
                      {p.consultation_fee !== null && <span>{p.consultation_fee} FCFA</span>}
                    </div>
                    {p.address && <div className="mt-1 text-xs text-foreground/50">{p.address}</div>}
                  </div>
                  <Button
                    size="sm"
                    variant={bookingId === p.id ? "secondary" : "default"}
                    onClick={() => setBookingId(bookingId === p.id ? null : p.id)}
                  >
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    {t("health.book")}
                  </Button>
                </div>

                {bookingId === p.id && (
                  <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        placeholder={t("health.phone")}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                      <Input
                        type="datetime-local"
                        value={preferredAt}
                        onChange={(e) => setPreferredAt(e.target.value)}
                      />
                    </div>
                    {p.home_visits && (
                      <label className="flex items-center gap-2 text-sm text-foreground/70">
                        <Checkbox checked={atHome} onCheckedChange={(v) => setAtHome(!!v)} />
                        {t("health.atHome")}
                      </label>
                    )}
                    {atHome && p.home_visits && (
                      <Input
                        placeholder={t("health.address")}
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                      />
                    )}
                    <Button className="w-full" onClick={() => book(p)} disabled={bookBusy}>
                      {bookBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t("health.confirmBooking")}
                    </Button>
                  </div>
                )}
              </GlassCard>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
