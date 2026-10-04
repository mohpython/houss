import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createOtcOrder, extractOtcPhoto } from "@/lib/otc.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Camera, Loader2, Pill, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DeliveryLocationPicker, type DeliveryLocation } from "@/components/DeliveryLocationPicker";

export const Route = createFileRoute("/_authenticated/app/otc")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" && search.q ? { q: search.q.slice(0, 500) } : {},
  head: () => ({
    meta: [
      { title: "Médicaments sans ordonnance — SAHA Santé" },
      {
        name: "description",
        content:
          "Commandez paracétamol, doliprane et autres médicaments sans ordonnance à la pharmacie la plus proche.",
      },
      { property: "og:title", content: "Médicaments sans ordonnance — SAHA Santé" },
      {
        property: "og:description",
        content: "Commandez vos médicaments sans ordonnance à la pharmacie la plus proche.",
      },
    ],
  }),
  component: Otc,
});

const SUGGESTIONS = ["Paracétamol", "Doliprane", "Ibuprofène", "Vitamine C", "Sérum physiologique"];

function Otc() {
  const { t } = useTranslation();
  const router = useRouter();
  const order = useServerFn(createOtcOrder);
  const scanPhoto = useServerFn(extractOtcPhoto);
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const { q } = Route.useSearch();
  const [names, setNames] = useState<string[]>(() => {
    const pre = (q ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10);
    return pre.length ? pre : [""];
  });
  const [busy, setBusy] = useState(false);
  const [deliveryLoc, setDeliveryLoc] = useState<DeliveryLocation | null>(null);

  const setAt = (i: number, v: string) => setNames((n) => n.map((x, j) => (j === i ? v : x)));
  const addRow = () => setNames((n) => (n.length >= 10 ? n : [...n, ""]));
  const removeRow = (i: number) => setNames((n) => (n.length === 1 ? n : n.filter((_, j) => j !== i)));

  const addNames = (found: string[]) =>
    setNames((cur) => {
      const next = [...cur];
      for (const name of found) {
        if (next.some((c) => c.trim().toLowerCase() === name.toLowerCase())) continue;
        const empty = next.findIndex((c) => c.trim() === "");
        if (empty >= 0) next[empty] = name;
        else if (next.length < 10) next.push(name);
      }
      return next;
    });

  const onPhoto = async (file: File | null) => {
    if (!file) return;
    setScanning(true);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read error"));
        reader.readAsDataURL(file);
      });
      const res = await scanPhoto({ data: { image } });
      if (!res.isMedicine || res.medicines.length === 0) {
        toast.error(t("otc.notFound"));
        return;
      }
      addNames(res.medicines.map((m) => m.name));
      toast.success(t("otc.found", { count: res.medicines.length }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("otc.notFound"));
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async () => {
    const medicines = names.map((n) => n.trim()).filter((n) => n.length >= 2);
    if (medicines.length === 0) {
      toast.error(t("otc.enterName"));
      return;
    }
    if (!deliveryLoc) {
      toast.error(t("delivery.chooseFirst"));
      return;
    }
    setBusy(true);
    try {
      const detail = deliveryLoc.detail?.trim() || undefined;
      const r = await order({
        data:
          deliveryLoc.mode === "neighborhood"
            ? { medicines, neighborhoodId: deliveryLoc.neighborhoodId, address: detail }
            : { medicines, lat: deliveryLoc.lat, lng: deliveryLoc.lng, address: detail },
      });
      toast.success(t("rxDetail.sentTo", { name: r.pharmacyName, count: r.matchedCount }));
      router.navigate({ to: "/app/reservations/$id/checkout", params: { id: r.reservationId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("otc.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-muted text-primary">
          <Pill className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("otc.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("otc.subtitle")}</p>
        </div>
      </div>

      <Card className="mt-6 p-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
        />
        <Button
          variant="outline"
          className="w-full"
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
        >
          {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
          {scanning ? t("otc.scanning") : t("otc.photo")}
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">{t("otc.photoHint")}</p>
      </Card>

      <Card className="mt-4 space-y-3 p-4">
        {names.map((n, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={n}
              placeholder={t("otc.placeholder")}
              onChange={(e) => setAt(i, e.target.value)}
            />
            {names.length > 1 && (
              <Button variant="ghost" size="icon" onClick={() => removeRow(i)} aria-label={t("otc.remove")}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addRow} disabled={names.length >= 10}>
          <Plus className="mr-2 h-4 w-4" />
          {t("otc.add")}
        </Button>

        <div className="flex flex-wrap gap-2 pt-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                setNames((cur) => {
                  const empty = cur.findIndex((c) => c.trim() === "");
                  if (empty >= 0) return cur.map((c, j) => (j === empty ? s : c));
                  return cur.length >= 10 ? cur : [...cur, s];
                })
              }
              className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-foreground/70 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      </Card>

      <Card className="mt-4 p-4">
        <h2 className="mb-1 text-sm font-semibold">{t("delivery.where")}</h2>
        <p className="mb-3 text-xs text-muted-foreground">{t("delivery.whereHint")}</p>
        <DeliveryLocationPicker value={deliveryLoc} onChange={setDeliveryLoc} disabled={busy} />
      </Card>

      <Button className="mt-6 w-full" size="lg" onClick={submit} disabled={busy || !deliveryLoc}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pill className="mr-2 h-4 w-4" />}
        {t("otc.submit")}
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">{t("otc.note")}</p>
    </div>
  );
}
