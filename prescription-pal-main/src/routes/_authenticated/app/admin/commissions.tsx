import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getIsAdmin } from "@/lib/admin-data.functions";
import {
  listPlatformCommissions,
  markCommissionsCollected,
  setPharmacyCommissionRate,
} from "@/lib/platform-commission.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { HandCoins, Wallet, CheckCircle2, Save, Check } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { formatAmount } from "@/lib/payment-config";

export const Route = createFileRoute("/_authenticated/app/admin/commissions")({
  head: () => ({
    meta: [{ title: i18n.t("commission.metaTitle") }],
  }),
  component: AdminCommissions,
});

type Row = {
  id: string;
  name: string;
  status: string;
  commission_rate: number;
  outstanding: number;
  collected: number;
  outstandingOrders: number;
  collectedOrders: number;
};

type Data = { rows: Row[]; totals: { outstanding: number; collected: number } };

function AdminCommissions() {
  const { t } = useTranslation();
  const { user } = Route.useRouteContext();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const checkAdmin = useServerFn(getIsAdmin);
  const fetchRows = useServerFn(listPlatformCommissions);
  const settle = useServerFn(markCommissionsCollected);
  const saveRate = useServerFn(setPharmacyCommissionRate);

  useEffect(() => {
    checkAdmin()
      .then((r) => setIsAdmin(r.isAdmin))
      .catch(() => setIsAdmin(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const load = async () => {
    try {
      const d = await fetchRows();
      setData(d as unknown as Data);
      setRateDrafts({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const statusLabel = (s: string) =>
    s === "approved"
      ? t("pharm.stApproved")
      : s === "rejected"
        ? t("pharm.stRejected")
        : t("pharm.stPending");

  const rateDirty = (r: Row) => {
    const draft = rateDrafts[r.id];
    if (draft === undefined) return false;
    const parsed = Number(draft);
    return Number.isFinite(parsed) && parsed !== Math.round(r.commission_rate * 1000) / 10;
  };

  const submitRate = async (r: Row) => {
    const draft = rateDrafts[r.id];
    if (draft === undefined) return;
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 50) {
      toast.error(t("common.error"));
      return;
    }
    setBusy(`rate:${r.id}`);
    try {
      await saveRate({ data: { pharmacyId: r.id, rate: parsed / 100 } });
      toast.success(t("commission.rateSaved", { pharmacy: r.name }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  };

  const doSettle = async (r: Row) => {
    const confirmed = window.confirm(
      t("commission.confirmSettle", { amount: formatAmount(r.outstanding), pharmacy: r.name }),
    );
    if (!confirmed) return;
    setBusy(`settle:${r.id}`);
    try {
      const res = await settle({ data: { pharmacyId: r.id } });
      toast.success(
        t("commission.settledToast", {
          amount: formatAmount(res.amount),
          n: res.ordersCount,
        }),
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  };

  if (isAdmin === null) {
    return (
      <div className="p-8">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!isAdmin) {
    return <div className="p-16 text-center">{t("commission.adminOnly")}</div>;
  }
  if (!data) {
    return (
      <div className="p-8 space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <HandCoins className="h-6 w-6 text-primary" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("commission.adminTitle")}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {t("commission.adminSubtitle")}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Card className="border-warning/30 bg-warning/5 p-4">
          <div className="flex items-center gap-2 text-sm text-warning">
            <Wallet className="h-4 w-4" aria-hidden="true" /> {t("commission.outstanding")}
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {formatAmount(data.totals.outstanding)}
          </p>
        </Card>
        <Card className="border-success/30 bg-success/5 p-4">
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {t("commission.collected")}
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {formatAmount(data.totals.collected)}
          </p>
        </Card>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{t("commission.pharmacyColumn")}</th>
              <th className="px-4 py-3">{t("commission.rate")}</th>
              <th className="px-4 py-3">{t("commission.due")}</th>
              <th className="px-4 py-3">{t("commission.collected")}</th>
              <th className="px-4 py-3 text-right">{t("commission.markSettled")}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id} className="border-t border-border align-middle">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.name}</div>
                  <Badge variant="secondary" className="mt-0.5 text-[10px]">
                    {statusLabel(r.status)}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={50}
                      step={0.5}
                      className="h-8 w-20"
                      value={rateDrafts[r.id] ?? String(Math.round(r.commission_rate * 1000) / 10)}
                      onChange={(e) =>
                        setRateDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && rateDirty(r)) void submitRate(r);
                      }}
                      aria-label={t("commission.rate")}
                    />
                    <span className="text-muted-foreground">%</span>
                    {rateDirty(r) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        disabled={busy === `rate:${r.id}`}
                        onClick={() => submitRate(r)}
                        aria-label={t("common.save", "Enregistrer")}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  <div className="font-semibold">{formatAmount(r.outstanding)}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("commission.ordersCount", { n: r.outstandingOrders })}
                  </div>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  <div>{formatAmount(r.collected)}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("commission.ordersCount", { n: r.collectedOrders })}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant={r.outstanding > 0 ? "default" : "ghost"}
                    disabled={r.outstanding <= 0 || busy === `settle:${r.id}`}
                    onClick={() => doSettle(r)}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    {t("commission.markSettled")}
                  </Button>
                </td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {t("commission.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
