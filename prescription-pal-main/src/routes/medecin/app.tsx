import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { auth } from "@/integrations/auth/client";
import { getDoctorSession } from "@/lib/doctor-rx.functions";
import { DoctorShell } from "@/components/doctor-rx/DoctorShell";

export const Route = createFileRoute("/medecin/app")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await auth.getUser();
    if (error || !data.user) throw redirect({ to: "/medecin/connexion" });
    try {
      const session = await getDoctorSession();
      return { session };
    } catch {
      throw redirect({ to: "/medecin/connexion" });
    }
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
