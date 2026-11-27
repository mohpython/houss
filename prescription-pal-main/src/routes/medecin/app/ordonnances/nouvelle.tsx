import { useEffect, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { getPatientForDoctor, type PatientSearchResult } from "@/lib/doctor-rx.functions";
import { PrescriptionEditor } from "@/components/doctor-rx/PrescriptionEditor";

const appRoute = getRouteApi("/medecin/app");

export const Route = createFileRoute("/medecin/app/ordonnances/nouvelle")({
  validateSearch: z.object({ patientId: z.string().uuid().optional() }),
  component: NewPrescriptionPage,
});

function NewPrescriptionPage() {
  const { session } = appRoute.useRouteContext();
  const { patientId } = Route.useSearch();
  const [patient, setPatient] = useState<PatientSearchResult | null>(null);
  const [loading, setLoading] = useState(!!patientId);

  useEffect(() => {
    if (!patientId) return;
    let alive = true;
    setLoading(true);
    getPatientForDoctor({ data: { patientId } })
      .then((res) => {
        if (!alive) return;
        setPatient({
          id: res.patient.id,
          fullName: res.patient.fullName,
          email: res.patient.email,
          phone: res.patient.phone,
          birthDate: res.patient.birthDate,
          sex: res.patient.sex,
          address: res.patient.address,
          sahaCode: res.patient.sahaCode,
          lastVisit: null,
          prescriptions: res.prescriptions.length,
        });
      })
      .catch(() => setPatient(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [patientId]);

  if (!session.practitioner) return null;
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[#9fc4b9]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  return <PrescriptionEditor me={session.practitioner} initialPatient={patient} />;
}
