import { useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertCircle, ExternalLink, Loader2, MapPin, Phone, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createReservation } from "@/lib/pharmacy.functions";
import { formatAmount } from "@/lib/payment-config";
import { DeliveryLocationPicker, type DeliveryLocation } from "@/components/DeliveryLocationPicker";

export type MissingAlt = {
  pharmacyId: string;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  distanceKm: number;
  price: number | null;
};

export type MissingEntry = {
  itemId?: string;
  name?: string;
  alternatives?: MissingAlt[];
};

type Props = {
  prescriptionId: string;
  missingItems: MissingEntry[];
  /** Delivery info of the current order, reused by default for the second order. */
  current: {
    neighborhoodId: string | null;
    lat: number | null;
    lng: number | null;
    address: string | null;
  };
  className?: string;
};

/**
 * Lists medicines missing from the chosen pharmacy and, for each partner
 * pharmacy that stocks some of them, lets the patient place a second order.
 */
export function MissingItemsPanel({ prescriptionId, missingItems, current, className }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const createRes = useServerFn(createReservation);
  const [busy, setBusy] = useState<string | null>(null);
  const [changeLoc, setChangeLoc] = useState(false);
  const [loc, setLoc] = useState<DeliveryLocation | null>(null);

  // Group alternatives by pharmacy so one button covers every missing item it has.
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { pharm: MissingAlt; items: Array<{ itemId: string; name: string; price: number | null }> }
    >();
    for (const m of missingItems) {
      if (!m.itemId) continue;
      for (const a of m.alternatives ?? []) {
        const g = map.get(a.pharmacyId) ?? { pharm: a, items: [] };
        g.items.push({ itemId: m.itemId, name: m.name ?? "", price: a.price });
        map.set(a.pharmacyId, g);
      }
    }
    return [...map.values()].sort(
      (a, b) => b.items.length - a.items.length || a.pharm.distanceKm - b.pharm.distanceKm,
    );
  }, [missingItems]);

  const uncovered = missingItems.filter((m) => !(m.alternatives?.length));

  const order = async (g: (typeof groups)[number]) => {
    setBusy(g.pharm.pharmacyId);
    try {
      const target = changeLoc && loc ? loc : null;
      const res = await createRes({
        data: {
          prescriptionId,
          pharmacyId: g.pharm.pharmacyId,
          itemIds: g.items.map((i) => i.itemId),
          patientLat: target
            ? target.mode === "gps"
              ? target.lat
              : undefined
            : current.neighborhoodId
              ? undefined
              : (current.lat ?? undefined),
          patientLng: target
            ? target.mode === "gps"
              ? target.lng
              : undefined
            : current.neighborhoodId
              ? undefined
              : (current.lng ?? undefined),
          neighborhoodId: target
            ? target.mode === "neighborhood"
              ? target.neighborhoodId
              : undefined
            : (current.neighborhoodId ?? undefined),
          patientAddress: target ? target.detail?.trim() || undefined : (current.address ?? undefined),
        },
      });
      toast.success(t("missing.created"));
      router.navigate({ to: "/app/reservations/$id/checkout", params: { id: res.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("pay.error"));
    } finally {
      setBusy(null);
    }
  };

  if (missingItems.length === 0) return null;

  return (
    <section
      className={`rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm ${className ?? ""}`}
      aria-labelledby="missing-title"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="missing-title" className="font-medium">
            {t("pay.missingTitle")}
          </h2>
          <ul className="mt-1 list-disc pl-4 text-xs text-foreground">
            {missingItems.map((m, i) => (
              <li key={m.itemId ?? i}>{m.name}</li>
            ))}
          </ul>
        </div>
      </div>

      {groups.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-foreground">{t("missing.elsewhere")}</p>
          {groups.map((g) => (
            <div
              key={g.pharm.pharmacyId}
              className="rounded-xl border border-border bg-background/40 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{g.pharm.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-foreground/60">
                    <span className="rounded-full bg-secondary px-2 py-0.5">
                      {g.pharm.distanceKm.toFixed(1)} km
                    </span>
                    {g.pharm.address && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3" />
                        {g.pharm.address}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-foreground/70">
                  {t("missing.hasCount", { count: g.items.length })}
                </span>
              </div>
              <ul className="mt-1.5 space-y-0.5 text-xs">
                {g.items.map((i) => (
                  <li key={i.itemId} className="flex justify-between gap-2">
                    <span className="truncate">{i.name}</span>
                    <span className="shrink-0 tabular-nums text-foreground/70">
                      {i.price != null ? formatAmount(i.price) : t("missing.priceUnknown")}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={busy !== null || (changeLoc && !loc)}
                  onClick={() => order(g)}
                >
                  {busy === g.pharm.pharmacyId ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShoppingBag className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {t("missing.orderThere")}
                </Button>
                {g.pharm.phone && (
                  <Button size="sm" variant="outline" className="rounded-full" asChild>
                    <a href={`tel:${g.pharm.phone}`}>
                      <Phone className="mr-1.5 h-3.5 w-3.5" />
                      {t("missing.call")}
                    </a>
                  </Button>
                )}
                {g.pharm.lat != null && g.pharm.lng != null && (
                  <Button size="sm" variant="outline" className="rounded-full" asChild>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${g.pharm.lat},${g.pharm.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      {t("missing.route")}
                    </a>
                  </Button>
                )}
              </div>
            </div>
          ))}

          <div className="pt-1">
            {!changeLoc ? (
              <button
                type="button"
                className="text-xs text-primary underline-offset-2 hover:underline"
                onClick={() => setChangeLoc(true)}
              >
                {t("missing.changeLocation")}
              </button>
            ) : (
              <div className="rounded-xl border border-border p-3">
                <p className="mb-2 text-xs text-foreground/70">{t("missing.changeLocationHint")}</p>
                <DeliveryLocationPicker value={loc} onChange={setLoc} />
                <button
                  type="button"
                  className="mt-2 text-xs text-foreground/60 underline-offset-2 hover:underline"
                  onClick={() => {
                    setChangeLoc(false);
                    setLoc(null);
                  }}
                >
                  {t("missing.keepLocation")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {uncovered.length > 0 && (
        <p className="mt-3 text-xs text-foreground/70">
          {t("missing.nowhere", { names: uncovered.map((m) => m.name).join(", ") })}
        </p>
      )}
      <p className="mt-2 text-xs text-foreground/60">{t("pay.missingHint")}</p>
    </section>
  );
}
