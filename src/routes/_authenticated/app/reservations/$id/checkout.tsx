import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getReservationCheckout } from "@/lib/reservations.functions";
import { useServerFn } from "@tanstack/react-start";
import { declareMobileMoneyPayment } from "@/lib/payment.functions";
import { setFulfillmentMethod } from "@/lib/fulfillment.functions";
import { MERCHANT_NUMBERS, formatAmount, type PaymentMethod } from "@/lib/payment-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Bike, Check, Loader2, MapPin, Store } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { MissingItemsPanel, type MissingEntry } from "@/components/MissingItemsPanel";

export const Route = createFileRoute("/_authenticated/app/reservations/$id/checkout")({
  head: () => ({
    meta: [
      { title: "Paiement — SAHA Santé" },
      { name: "description", content: "Vos médicaments, le prix et le paiement en un écran." },
      { property: "og:title", content: "Paiement — SAHA Santé" },
      {
        property: "og:description",
        content: "Vos médicaments, le prix et le paiement en un écran.",
      },
    ],
  }),
  component: Checkout,
});

type Row = {
  id: string;
  items_total: number | null;
  delivery_fee: number | null;
  total_amount: number | null;
  payment_status: string;
  fulfillment_method: string;
  patient_address: string | null;
  patient_phone: string | null;
  is_partial: boolean | null;
  missing_items: MissingEntry[] | null;
  prescription_id: string;
  neighborhood_id: string | null;
  patient_lat: number | null;
  patient_lng: number | null;
  pharmacies: { name: string; address: string | null } | null;
  reservation_items: Array<{
    id: string;
    unit_price: number | null;
    prescription_items: { medicine_name_raw: string; strength: string | null } | null;
  }>;
};

function Checkout() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const router = useRouter();
  const [row, setRow] = useState<Row | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("orange_money");
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const phoneValid = /^\+?[0-9 ]{8,20}$/.test(phone.trim());
  const declare = useServerFn(declareMobileMoneyPayment);
  const setMethodFn = useServerFn(setFulfillmentMethod);
  const [switching, setSwitching] = useState(false);

  const chooseFulfillment = async (m: "delivery" | "pickup") => {
    setSwitching(true);
    try {
      await setMethodFn({ data: { reservationId: id, method: m } });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("pay.error"));
    } finally {
      setSwitching(false);
    }
  };

  const load = async () => {
    const data = await getReservationCheckout({ data: { id } }).catch(() => null);
    const r = (data as unknown as Row) ?? null;
    setRow(r);
    if (r?.patient_phone) setPhone((prev) => prev || r.patient_phone!);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const submit = async () => {
    if (reference.trim().length < 4) return;
    if (!phoneValid) {
      toast.error(t("pay.phoneInvalid"));
      return;
    }
    setBusy(true);
    try {
      await declare({
        data: { reservationId: id, method, reference: reference.trim(), phone: phone.trim() },
      });
      toast.success(t("pay.sent"));
      router.navigate({ to: "/app/reservations/$id/track", params: { id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("pay.error"));
    } finally {
      setBusy(false);
    }
  };

  if (!row) {
    return (
      <div className="mx-auto max-w-md space-y-3 px-6 py-10">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const settled = row.payment_status !== "unpaid";

  return (
    <div className="mx-auto max-w-md px-6 py-8">
      <h1 className="text-lg font-semibold">{t("pay.title")}</h1>

      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-primary"
          aria-hidden
        >
          <Store className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{row.pharmacies?.name}</div>
          {row.pharmacies?.address && (
            <div className="flex items-center gap-1 truncate text-xs text-foreground/50">
              <MapPin className="h-3 w-3" />
              {row.pharmacies.address}
            </div>
          )}
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {row.reservation_items.map((i) => (
          <li
            key={i.id}
            className="flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3"
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-success/30 bg-success/10 text-success"
              aria-label={t("pay.available")}
            >
              <Check className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {i.prescription_items?.medicine_name_raw}
              {i.prescription_items?.strength && (
                <span className="ml-2 text-foreground/50">{i.prescription_items.strength}</span>
              )}
            </span>
            <span className="shrink-0 text-sm tabular-nums">{formatAmount(i.unit_price)}</span>
          </li>
        ))}
      </ul>

      {row.is_partial && (row.missing_items?.length ?? 0) > 0 && (
        <MissingItemsPanel
          className="mt-3"
          prescriptionId={row.prescription_id}
          missingItems={row.missing_items!}
          current={{
            neighborhoodId: row.neighborhood_id,
            lat: row.patient_lat,
            lng: row.patient_lng,
            address: row.patient_address,
          }}
        />
      )}

      {!settled && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-foreground/70">{t("pay.fulfillment")}</p>
          <div className="grid grid-cols-2 gap-2">
            {(["delivery", "pickup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={switching}
                onClick={() => chooseFulfillment(m)}
                className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm transition-colors ${
                  row.fulfillment_method === m
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-white/10 text-foreground/60"
                }`}
              >
                {m === "delivery" ? <Bike className="h-4 w-4" /> : <Store className="h-4 w-4" />}
                {m === "delivery" ? t("pay.deliverHome") : t("pay.pickupSelf")}
              </button>
            ))}
          </div>
          {row.fulfillment_method === "pickup" && (
            <p className="mt-2 text-center text-xs text-foreground/60">{t("pay.pickupHint")}</p>
          )}
          {row.fulfillment_method === "delivery" && row.patient_address && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-foreground/70">
              <MapPin className="h-3.5 w-3.5 text-accent" />
              {row.patient_address}
            </p>
          )}
        </div>
      )}

      <dl className="mt-4 space-y-1 rounded-2xl border border-white/10 px-4 py-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-foreground/60">{t("pay.items")}</dt>
          <dd className="tabular-nums">{formatAmount(row.items_total)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-foreground/60">{t("pay.delivery")}</dt>
          <dd className="tabular-nums">{formatAmount(row.delivery_fee)}</dd>
        </div>
        <div className="flex justify-between border-t border-white/10 pt-2 text-base font-semibold">
          <dt>{t("pay.total")}</dt>
          <dd className="tabular-nums">{formatAmount(row.total_amount)}</dd>
        </div>
      </dl>

      {settled ? (
        <div className="mt-6 space-y-3 text-center">
          <p className="text-sm text-foreground/70">
            {row.payment_status === "paid" ? t("pay.paid") : t("pay.waiting")}
          </p>
          <Button
            className="w-full rounded-full"
            onClick={() => router.navigate({ to: "/app/reservations/$id/track", params: { id } })}
          >
            {t("pay.track")}
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["orange_money", "moov_money"] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`rounded-2xl border px-4 py-3 text-sm transition-colors ${
                  method === m
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-white/10 text-foreground/60"
                }`}
              >
                {m === "orange_money" ? t("pay.orange") : t("pay.moov")}
              </button>
            ))}
          </div>

          <p className="text-center text-xs text-foreground/60">
            {t("pay.sendTo")} <span className="font-medium">{MERCHANT_NUMBERS[method]}</span>
          </p>

          <div className="space-y-1">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              inputMode="tel"
              maxLength={24}
              placeholder={t("pay.phonePlaceholder")}
              aria-label={t("pay.phoneLabel")}
            />
            <p className="text-xs text-foreground/60">{t("pay.phoneHint")}</p>
          </div>

          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={64}
            placeholder={t("pay.refPlaceholder")}
            aria-label={t("pay.reference")}
          />

          <Button
            className="w-full rounded-full"
            disabled={busy || reference.trim().length < 4 || !phoneValid}
            onClick={submit}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("pay.pay")} · {formatAmount(row.total_amount)}
          </Button>
        </div>
      )}
    </div>
  );
}
