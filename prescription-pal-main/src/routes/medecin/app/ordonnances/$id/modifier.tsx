import { useEffect, useState } from "react";
import { createFileRoute, Link, getRouteApi } from "@tanstack/react-router";
import { ArrowLeft, Loader2, LockKeyhole } from "lucide-react";
import { getDoctorPrescription } from "@/lib/doctor-rx.functions";
import { PrescriptionEditor, type EditorRx } from "@/components/doctor-rx/PrescriptionEditor";

const appRoute = getRouteApi("/medecin/app");

export const Route = createFileRoute("/medecin/app/ordonnances/$id/modifier")({
  component: EditPrescriptionPage,
});

type Detail = Awaited<ReturnType<typeof getDoctorPrescription>>;

function EditPrescriptionPage() {
  const { id } = Route.useParams();
  const { session } = appRoute.useRouteContext();
  const [rx, setRx] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getDoctorPrescription({ data: { id } })
      .then((res) => alive && setRx(res))
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Chargement impossible");
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-rose-300/25 bg-rose-400/10 p-6 text-sm text-rose-200">
        {error}
      </div>
    );
  }

  if (!rx) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[#9fc4b9]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (rx.status !== "draft") {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rx-glass rounded-[28px] p-7 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-400/10 text-amber-300">
            <LockKeyhole className="h-7 w-7" />
          </span>
          <h1 className="mt-4 font-display text-2xl text-white">Document signé</h1>
          <p className="mt-2 text-xs leading-relaxed text-[#a9ccc2]">
            Cette ordonnance ne peut plus être modifiée directement. Pour corriger son contenu,
            créez un avenant depuis le document : une nouvelle version sera rédigée, signée et
            auditée.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              to="/medecin/app/ordonnances/$id"
              params={{ id: rx.id }}
              className="rx-btn-primary px-5 py-2.5 text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              Ouvrir le document
            </Link>
            <Link to="/medecin/app/ordonnances" className="rx-btn-ghost px-5 py-2.5 text-sm">
              Mes ordonnances
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!session.practitioner) return null;

  return (
    <PrescriptionEditor
      me={rx.me ?? session.practitioner}
      rx={rx as unknown as EditorRx}
    />
  );
}
