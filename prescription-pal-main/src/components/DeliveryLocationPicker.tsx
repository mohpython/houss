import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Locate, MapPin, Search, Check, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listNeighborhoods, type Neighborhood } from "@/lib/neighborhoods.functions";
import { cn } from "@/lib/utils";

export type DeliveryLocation =
  | { mode: "gps"; lat: number; lng: number; detail?: string }
  | { mode: "neighborhood"; neighborhoodId: string; name: string; lat: number; lng: number; detail?: string };

type Props = {
  value: DeliveryLocation | null;
  onChange: (v: DeliveryLocation | null) => void;
  /** Whether to show the optional "précision" free-text field. */
  withDetail?: boolean;
  disabled?: boolean;
  className?: string;
};

export function getBrowserPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

/**
 * Lets the patient choose where to deliver: their current GPS position, or a
 * neighborhood (quartier) from the admin-managed list.
 */
export function DeliveryLocationPicker({ value, onChange, withDetail = true, disabled, className }: Props) {
  const { t } = useTranslation();
  const fetchNb = useServerFn(listNeighborhoods);
  const [mode, setMode] = useState<"gps" | "neighborhood">(value?.mode ?? "gps");
  const [nbs, setNbs] = useState<Neighborhood[] | null>(null);
  const [query, setQuery] = useState(value?.mode === "neighborhood" ? value.name : "");
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoErr, setGeoErr] = useState(false);
  const [detail, setDetail] = useState(value?.detail ?? "");

  useEffect(() => {
    fetchNb({ data: {} })
      .then(setNbs)
      .catch(() => setNbs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locate = async () => {
    setGeoBusy(true);
    setGeoErr(false);
    const pos = await getBrowserPosition();
    setGeoBusy(false);
    if (!pos) {
      setGeoErr(true);
      onChange(null);
      return;
    }
    onChange({ mode: "gps", lat: pos.lat, lng: pos.lng, detail });
  };

  useEffect(() => {
    if (mode === "gps" && (!value || value.mode !== "gps")) void locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (nbs ?? []).filter((n) => !q || n.name.toLowerCase().includes(q));
  }, [nbs, query]);

  const pick = (n: Neighborhood) => {
    setQuery(n.name);
    onChange({ mode: "neighborhood", neighborhoodId: n.id, name: n.name, lat: n.lat, lng: n.lng, detail });
  };

  const clearSelection = () => {
    setQuery("");
    onChange(null);
  };

  const updateDetail = (d: string) => {
    setDetail(d);
    if (value) onChange({ ...value, detail: d });
  };

  const tabBase =
    "flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium transition-colors min-h-[44px]";

  return (
    <div className={cn("space-y-4", className)}>
      <div role="tablist" aria-label={t("delivery.where")} className="flex gap-2 rounded-full border border-white/10 bg-white/5 p-1">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "gps"}
          disabled={disabled}
          onClick={() => setMode("gps")}
          className={cn(tabBase, mode === "gps" ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:text-foreground")}
        >
          <Locate className="h-4 w-4" />
          {t("delivery.myPosition")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "neighborhood"}
          disabled={disabled}
          onClick={() => {
            setMode("neighborhood");
            if (value?.mode === "gps") onChange(null);
          }}
          className={cn(tabBase, mode === "neighborhood" ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:text-foreground")}
        >
          <MapPin className="h-4 w-4" />
          {t("delivery.otherNeighborhood")}
        </button>
      </div>

      {mode === "gps" && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
          {geoBusy ? (
            <span className="flex items-center gap-2 text-foreground/70">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("delivery.locating")}
            </span>
          ) : value?.mode === "gps" ? (
            <span className="flex items-center gap-2 text-success">
              <Check className="h-4 w-4" /> {t("delivery.positionOk")}
            </span>
          ) : (
            <div className="space-y-2">
              <p className="text-destructive">{geoErr ? t("delivery.geoDenied") : t("delivery.geoRequired")}</p>
              <button type="button" onClick={locate} className="text-primary underline-offset-2 hover:underline">
                {t("delivery.retryGeo")}
              </button>
            </div>
          )}
        </div>
      )}

      {mode === "neighborhood" &&
        (value?.mode === "neighborhood" ? (
          <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success/10 px-4 py-3.5 text-sm">
            <Check className="h-5 w-5 shrink-0 text-success" />
            <span className="flex-1">
              {t("delivery.quartierSelected")} : <strong className="font-semibold">{value.name}</strong>
            </span>
            <button
              type="button"
              onClick={clearSelection}
              disabled={disabled}
              className="shrink-0 text-primary underline-offset-2 hover:underline"
            >
              {t("delivery.change")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/50" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                }}
                placeholder={t("delivery.searchNeighborhood")}
                className="pl-9 pr-9"
                disabled={disabled}
                aria-label={t("delivery.searchNeighborhood")}
              />
              {query && (
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={disabled}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-foreground"
                  aria-label={t("common.clear")}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto rounded-2xl border border-white/10 bg-white/5" role="listbox" aria-label={t("delivery.otherNeighborhood")}>
              {nbs === null && (
                <p className="p-4 text-sm text-foreground/60">{t("common.loading")}</p>
              )}
              {nbs !== null && filtered.length === 0 && (
                <p className="p-4 text-sm text-foreground/60">{t("delivery.noNeighborhood")}</p>
              )}
              {filtered.map((n) => {
                return (
                  <button
                    key={n.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    disabled={disabled}
                    onClick={() => pick(n)}
                    className={cn(
                      "flex min-h-[44px] w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/5",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 opacity-60" />
                      {n.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}


      {withDetail && (
        <div className="space-y-1.5">
          <Label htmlFor="delivery-detail">{t("delivery.detail")}</Label>
          <Input
            id="delivery-detail"
            value={detail}
            onChange={(e) => updateDetail(e.target.value)}
            placeholder={t("delivery.detailPlaceholder")}
            maxLength={200}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
