import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPharmacyCommissions } from "@/lib/platform-commission.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/ui/skeletons";
import { ArrowLeft, HandCoins, Wallet, CheckCircle2, Receipt } from "lucide-react";
import { formatAmount } from "@/lib/payment-config";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

export const Route = createFileRoute("/_authenticated/app/pharmacy/$pharmacyId/commissions")({
  head: () => ({
    meta: [{ title: i18n.t("commission.metaTitle") }],
  }),
  component: Commissions,
});

type CommissionOrder = {
  id: string;
  created_at: string;
  items_total: number;
  commission_rate: number;
  commission_amount: number;
  order_fee: number;
  due: number;
  settled: boolean;
};

type Payout = { id: string; amount: number; orders_count: number; created_at: string };

type Data = {
  pharmacy: { id: string; name: string; status: string; commission_rate: number };
  summary: {
    outstanding: number;
    collected: number;
    outstandingOrders: number;
    collectedOrders: number;
  };
  orders: CommissionOrder[];
  payouts: Payout[];
};

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d.slice(0, 10);
  }
}

function Commissions() {
  const { t } = useTranslation();
  const { pharmacyId } = Route.useParams();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchCommissions = useServerFn(getPharmacyCommissions);

  useEffect(() => {
    fetchCommissions({ data: { pharmacyId } })
      .then((d) => setData(d as unknown as Data))
      .catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pharmacyId]);

  if (error) {
    return (
      <div className="px-4 py-8 text-center text-sm text-destructive">
        {error}{" "}
        <Link to="/app/pharmacy" className="ml-2 text-primary underline-offset-2 hover:underline">
          {t("common.back", "Retour")}
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-4 py-6">
        <PageSkeleton />
      </div>
    );
  }

  const ratePct = Math.round(data.pharmacy.commission_rate * 1000) / 10;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link
        to="/app/pharmacy"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("common.back", "Retour")}
      </Link>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <HandCoins className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight">{t("commission.title")}</h1>
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("commission.subtitle")}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Receipt className="h-4 w-4" aria-hidden="true" /> {t("commission.rate")}
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums">{ratePct} %</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("commission.paidOrders")}</p>
        </Card>
        <Card className="border-warning/30 bg-warning/5 p-4">
          <div className="flex items-center gap-2 text-sm text-warning">
            <Wallet className="h-4 w-4" aria-hidden="true" /> {t("commission.outstanding")}
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {formatAmount(data.summary.outstanding)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("commission.ordersDue", {
              outstandingOrders: data.summary.outstandingOrders,
              collectedOrders: data.summary.collectedOrders,
            })}
          </p>
        </Card>
        <Card className="border-success/30 bg-success/5 p-4">
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {t("commission.collected")}
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {formatAmount(data.summary.collected)}
          </p>
        </Card>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{t("commission.date")}</th>
              <th className="px-4 py-3">{t("pay.items", "Médicaments")}</th>
              <th className="px-4 py-3">{t("commission.commission")}</th>
              <th className="px-4 py-3">{t("commission.orderFee")}</th>
              <th className="px-4 py-3">{t("commission.due")}</th>
              <th className="px-4 py-3 text-right">{t("commission.collected")}</th>
            </tr>
          </thead>
          <tbody>
            {data.orders.map((o) => (
              <tr key={o.id} className="border-t border-border">
                <td className="px-4 py-2 whitespace-nowrap">{formatDate(o.created_at)}</td>
                <td className="px-4 py-2 tabular-nums">{formatAmount(o.items_total)}</td>
                <td className="px-4 py-2 tabular-nums">
                  {formatAmount(o.commission_amount)}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({Math.round(o.commission_rate * 1000) / 10} %)
                  </span>
                </td>
                <td className="px-4 py-2 tabular-nums">{formatAmount(o.order_fee)}</td>
                <td className="px-4 py-2 font-medium tabular-nums">{formatAmount(o.due)}</td>
                <td className="px-4 py-2 text-right">
                  <Badge
                    variant="secondary"
                    className={
                      o.settled ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                    }
                  >
                    {o.settled ? t("commission.settled") : t("commission.pending")}
                  </Badge>
                </td>
              </tr>
            ))}
            {data.orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {t("commission.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data.payouts.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("commission.payoutsHistory")}
          </h2>
          <ul className="mt-2 space-y-2">
            {data.payouts.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm"
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                  {formatDate(p.created_at)} · {t("commission.ordersCount", { n: p.orders_count })}
                </span>
                <span className="font-semibold tabular-nums">{formatAmount(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
