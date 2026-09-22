import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/ui/skeletons";
import { Store, MessageSquareHeart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/i18n";

export const Route = createFileRoute("/_authenticated/app/reservations/")({
  component: List,
});

type Res = {
  id: string;
  status: string;
  created_at: string;
  pharmacies: { name: string; address: string } | null;
};

function List() {
  const { t } = useTranslation();
  const { user } = Route.useRouteContext();
  const [rows, setRows] = useState<Res[] | null>(null);
  useEffect(() => {
    supabase
      .from("reservations")
      .select("id, status, created_at, pharmacies(name, address)")
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as unknown as Res[]) ?? []));
  }, [user.id]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{t("resList.title")}</h1>
      <div className="mt-6 space-y-3">
        {rows === null && <ListSkeleton rows={3} rowClassName="h-24" />}
        {rows?.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">{t("resList.empty")}</Card>
        )}
        {rows?.map((r) => (
          <Link key={r.id} to="/app/reservations/$id" params={{ id: r.id }}>
            <Card className="flex items-center gap-4 p-4 transition hover:border-primary">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Store className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{r.pharmacies?.name ?? t("home.pharmacyLabel")}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString(getDateLocale())}
                </div>
              </div>
              <StatusBadge status={r.status} />
            </Card>
          </Link>
        ))}
      </div>

      <Link to="/feedback" className="mt-6 block">
        <Card className="flex items-center gap-3 p-4 transition hover:border-primary">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageSquareHeart className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-medium">{t("feedback.generalTitle")}</div>
            <div className="text-xs text-muted-foreground">{t("feedback.generalCta")}</div>
          </div>
        </Card>
      </Link>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: t("resStatus.pending"), cls: "bg-muted text-muted-foreground" },
    accepted: { label: t("resStatus.accepted"), cls: "bg-primary/10 text-primary" },
    rejected: { label: t("resStatus.rejected"), cls: "bg-destructive/10 text-destructive" },
    ready: { label: t("resStatus.ready"), cls: "bg-accent/15 text-accent" },
    completed: { label: t("resStatus.completed"), cls: "bg-success/10 text-success" },
    cancelled: { label: t("resStatus.cancelled"), cls: "bg-muted text-muted-foreground" },
  };
  const s = map[status] ?? map.pending;
  return <Badge variant="secondary" className={s.cls}>{s.label}</Badge>;
}
