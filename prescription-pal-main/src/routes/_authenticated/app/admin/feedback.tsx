import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listFeedback } from "@/lib/feedback.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StarRating } from "@/components/StarRating";
import { toast } from "sonner";
import { MessageSquareHeart } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n, { getDateLocale } from "@/i18n";

export const Route = createFileRoute("/_authenticated/app/admin/feedback")({
  head: () => ({
    meta: [
      { title: i18n.t("admin.feedbackTitle") },
      { name: "description", content: i18n.t("admin.feedbackDesc") },
      { property: "og:title", content: i18n.t("admin.feedbackTitle") },
      {
        property: "og:description",
        content: i18n.t("admin.feedbackDesc"),
      },
    ],
  }),
  component: AdminFeedback,
});

type Data = Awaited<ReturnType<typeof listFeedback>>;

function AdminFeedback() {
  const { t } = useTranslation();
  const [data, setData] = useState<Data | null>(null);
  const load = useServerFn(listFeedback);

  useEffect(() => {
    load({})
      .then(setData)
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : t("common.error"));
        setData({ rows: [], averages: [], overall: 0 });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center gap-2">
        <MessageSquareHeart className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.feedbackHeading")}</h1>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("admin.feedbackSubtitle")}
      </p>

      {data === null ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          <Card className="mt-6 p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <div className="text-xs text-muted-foreground">{t("admin.avgNote")}</div>
                <div className="text-2xl font-bold">{data.overall || "—"}/5</div>
              </div>
              <StarRating value={Math.round(data.overall)} />
              <Badge variant="secondary">{t("admin.reviewsCount", { n: data.rows.length })}</Badge>
            </div>
            {data.averages.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {data.averages.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2 text-sm"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-muted-foreground">
                      {p.average}/5 · {p.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="mt-6 space-y-3">
            {data.rows.length === 0 && (
              <Card className="p-6 text-sm text-muted-foreground">{t("admin.noReviews")}</Card>
            )}
            {data.rows.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <StarRating value={r.rating} size="sm" />
                  <span className="text-sm font-medium">{r.pharmacyName ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString(getDateLocale())}
                  </span>
                  {r.phone && <Badge variant="secondary">{r.phone}</Badge>}
                </div>
                {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
