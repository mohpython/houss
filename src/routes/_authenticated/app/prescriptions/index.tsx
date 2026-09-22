import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listMyPrescriptions } from "@/lib/prescriptions.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ChevronRight } from "lucide-react";
import { ListSkeleton } from "@/components/ui/skeletons";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/i18n";

export const Route = createFileRoute("/_authenticated/app/prescriptions/")({
  component: List,
});

type Rx = {
  id: string;
  patient_name: string | null;
  doctor_name: string | null;
  prescription_date: string | null;
  status: string;
  ai_confidence: number | null;
  created_at: string;
};

function List() {
  const { t } = useTranslation();
  const { user } = Route.useRouteContext();
  const [rows, setRows] = useState<Rx[] | null>(null);
  const listFn = useServerFn(listMyPrescriptions);

  useEffect(() => {
    listFn()
      .then((data) => setRows((data as Rx[]) ?? []))
      .catch(() => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{t("rxList.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("rxList.subtitle")}</p>

      <div className="mt-6 space-y-3">
        {rows === null && <ListSkeleton rows={3} />}
        {rows?.length === 0 && (
          <Card className="p-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">{t("rxList.empty")}</p>
            <Link
              to="/app/scan"
              className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
            >
              {t("rxList.scanFirst")}
            </Link>
          </Card>
        )}
        {rows?.map((r) => (
          <Link key={r.id} to="/app/prescriptions/$id" params={{ id: r.id }}>
            <Card className="flex items-center gap-4 p-4 transition hover:border-primary">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {r.doctor_name ? `Dr. ${r.doctor_name}` : t("rxList.rxLabel")}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{new Date(r.created_at).toLocaleDateString(getDateLocale())}</span>
                  <StatusBadge status={r.status} confidence={r.ai_confidence} />
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status, confidence }: { status: string; confidence: number | null }) {
  const { t } = useTranslation();
  const map: Record<string, { label: string; className: string }> = {
    uploaded: { label: t("rxList.status.uploaded"), className: "bg-muted text-muted-foreground" },
    processing: { label: t("rxList.status.processing"), className: "bg-primary/10 text-primary" },
    extracted: {
      label:
        confidence != null && confidence < 85
          ? `${t("rxList.status.toVerify")} (${confidence}%)`
          : `${t("rxList.status.extracted")} (${confidence ?? 0}%)`,
      className:
        confidence != null && confidence < 85
          ? "bg-warning/10 text-warning"
          : "bg-success/10 text-success",
    },
    verified: { label: t("rxList.status.verified"), className: "bg-success/10 text-success" },
    failed: { label: t("rxList.status.failed"), className: "bg-destructive/10 text-destructive" },
  };
  const s = map[status] ?? map.uploaded;
  return (
    <Badge className={s.className} variant="secondary">
      {s.label}
    </Badge>
  );
}
