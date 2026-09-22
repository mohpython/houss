import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listAppointmentsAdmin,
  type AdminAppointmentRow,
} from "@/lib/practitioner-admin.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CalendarClock, MapPin, Phone, Mail, Home, Stethoscope, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/admin/appointments")({
  head: () => ({
    meta: [
      { title: "Rendez-vous — Administration SAHA Santé" },
      {
        name: "description",
        content:
          "Suivi administrateur de tous les rendez-vous patients avec médecins et infirmiers.",
      },
      { property: "og:title", content: "Rendez-vous — Administration SAHA Santé" },
      {
        property: "og:description",
        content: "Détail des demandes de consultation : patient, praticien, triage IA et statut.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAppointments,
});

const statusTone: Record<string, string> = {
  requested: "bg-warning/10 text-warning",
  accepted: "bg-success/10 text-success",
  rescheduled: "bg-primary/10 text-primary",
  completed: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

function AdminAppointments() {
  const listFn = useServerFn(listAppointmentsAdmin);
  const [rows, setRows] = useState<AdminAppointmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    listFn({})
      .then(setRows)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Erreur");
        setRows([]);
        toast.error(e instanceof Error ? e.message : "Erreur");
      });
  }, [listFn]);

  const filtered = (rows ?? []).filter((r) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [
      r.patient_name,
      r.patient_email,
      r.patient_phone,
      r.practitioner_name,
      r.reason,
      r.status,
    ]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(s));
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Rendez-vous praticiens</h1>
        </div>
        <Link to="/app/admin" className="text-sm text-primary hover:underline">
          Retour admin
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Toutes les demandes de consultation avec les informations complètes du patient.
      </p>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher un patient, un praticien, un statut…"
        className="mt-4 max-w-md"
      />

      {error && (
        <Card className="mt-4 border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </Card>
      )}

      <div className="mt-4 space-y-3">
        {rows === null && <Skeleton className="h-32 w-full" />}
        {rows !== null && filtered.length === 0 && !error && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Aucun rendez-vous pour le moment.
          </Card>
        )}
        {filtered.map((r) => {
          const triage = r.triage;
          return (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    <User className="h-4 w-4 text-primary" />
                    {r.patient_name ?? "Patient"}
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {r.patient_email && (
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {r.patient_email}
                      </div>
                    )}
                    {(r.patient_phone || r.patient_profile_phone) && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {r.patient_phone ?? r.patient_profile_phone}
                      </div>
                    )}
                    {r.patient_address && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {r.patient_address}
                        {r.patient_lat != null && r.patient_lng != null
                          ? ` (${r.patient_lat.toFixed(4)}, ${r.patient_lng.toFixed(4)})`
                          : ""}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="secondary" className={statusTone[r.status] ?? ""}>
                    {r.status}
                  </Badge>
                  {r.at_home && (
                    <Badge variant="outline" className="gap-1">
                      <Home className="h-3 w-3" /> À domicile
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  {r.practitioner_name ?? "Praticien"}
                  <span className="text-xs font-normal text-muted-foreground">
                    {r.practitioner_type === "nurse" ? "Infirmier" : "Médecin"}
                    {r.practitioner_specialty ? ` · ${r.practitioner_specialty}` : ""}
                    {r.practitioner_city ? ` · ${r.practitioner_city}` : ""}
                    {r.practitioner_phone ? ` · ${r.practitioner_phone}` : ""}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid gap-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Motif : </span>
                  {r.reason}
                </div>
                {r.symptoms && (
                  <div>
                    <span className="text-muted-foreground">Symptômes : </span>
                    {r.symptoms}
                  </div>
                )}
                {triage?.summary && (
                  <div>
                    <span className="text-muted-foreground">Triage IA : </span>
                    {triage.summary}
                    {triage.urgency ? ` · urgence : ${triage.urgency}` : ""}
                  </div>
                )}
                {triage?.possible_conditions && triage.possible_conditions.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {triage.possible_conditions.map((c) => (
                      <Badge key={c} variant="outline" className="text-xs">
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
                {r.practitioner_notes && (
                  <div>
                    <span className="text-muted-foreground">Notes praticien : </span>
                    {r.practitioner_notes}
                  </div>
                )}
              </div>

              <div className="mt-3 text-xs text-muted-foreground">
                Demandé le {new Date(r.requested_at).toLocaleString("fr-FR")}
                {r.proposed_at
                  ? ` · souhaité : ${new Date(r.proposed_at).toLocaleString("fr-FR")}`
                  : ""}
                {r.scheduled_at
                  ? ` · confirmé : ${new Date(r.scheduled_at).toLocaleString("fr-FR")}`
                  : ""}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
