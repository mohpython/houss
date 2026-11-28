import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { auth } from "@/integrations/auth/client";
import { getDoctorSession, type DoctorSession } from "@/lib/doctor-rx.functions";
import { DoctorShell } from "@/components/doctor-rx/DoctorShell";

export const Route = createFileRoute("/medecin/app")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await auth.getUser();
    if (error || !data.user) throw redirect({ to: "/medecin/connexion" });
    let session: DoctorSession;
    try {
      session = await getDoctorSession();
    } catch {
      throw redirect({ to: "/medecin/connexion", search: { reason: "not_approved" } });
    }
    // Verrou métier : même si un compte est connecté ailleurs dans l'app,
    // seul un praticien `doctor` approuvé par l'admin ouvre ce portail.
    if (session.access !== "ok") {
      throw redirect({ to: "/medecin/connexion", search: { reason: "not_approved" } });
    }
    return { session };
  },
  component: DoctorAppLayout,
});

function DoctorAppLayout() {
  const { session } = Route.useRouteContext();
  return (
    <DoctorShell session={session}>
      <Outlet />
    </DoctorShell>
  );
}
