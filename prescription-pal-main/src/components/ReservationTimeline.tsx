import { Check, Clock, Package, Bike, MapPin, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/i18n";

export type TimelineData = {
  status: string;
  created_at: string;
  accepted_at?: string | null;
  ready_at?: string | null;
  assigned_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  delivery_status?: string | null;
  fulfillment_method?: string | null;
};

type Step = {
  key: string;
  label: string;
  icon: React.ReactNode;
  ts: string | null | undefined;
  done: boolean;
  active: boolean;
};

function fmt(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString(getDateLocale(), { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
}

export function ReservationTimeline({ r }: { r: TimelineData }) {
  const { t } = useTranslation();
  const cancelled = r.status === "cancelled" || r.status === "rejected";
  const isPickup = r.fulfillment_method === "pickup";
  const s: Step[] = [
    { key: "created", label: t("timeline.created"), icon: <Clock className="h-4 w-4" />, ts: r.created_at, done: true, active: r.status === "pending" },
    { key: "accepted", label: t("timeline.accepted"), icon: <Check className="h-4 w-4" />, ts: r.accepted_at, done: !!r.accepted_at || ["ready", "completed"].includes(r.status), active: r.status === "accepted" },
    { key: "ready", label: t("timeline.ready"), icon: <Package className="h-4 w-4" />, ts: r.ready_at, done: !!r.ready_at || r.status === "completed", active: r.status === "ready" && (isPickup || !r.assigned_at) },
    ...(isPickup
      ? []
      : [
          { key: "assigned", label: t("timeline.assigned"), icon: <Bike className="h-4 w-4" />, ts: r.assigned_at, done: !!r.assigned_at, active: r.delivery_status === "assigned" },
          { key: "picked", label: t("timeline.picked"), icon: <Package className="h-4 w-4" />, ts: r.picked_up_at, done: !!r.picked_up_at, active: r.delivery_status === "picked_up" || r.delivery_status === "en_route" },
        ]),
    { key: "delivered", label: isPickup ? t("timeline.collected") : t("timeline.delivered"), icon: <MapPin className="h-4 w-4" />, ts: r.delivered_at, done: !!r.delivered_at || r.status === "completed", active: false },
  ];

  if (cancelled) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <XCircle className="h-4 w-4" />
        {r.status === "rejected" ? t("timeline.rejected") : t("timeline.cancelled")}
      </div>
    );
  }

  return (
    <ol className="relative space-y-4">
      {s.map((step, i) => (
        <li key={step.key} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
                step.done
                  ? "border-primary bg-primary text-primary-foreground"
                  : step.active
                    ? "border-primary bg-primary/10 text-primary animate-pulse"
                    : "border-muted-foreground/30 bg-background text-muted-foreground",
              )}
            >
              {step.icon}
            </div>
            {i < s.length - 1 && (
              <div className={cn("mt-1 h-6 w-px", step.done ? "bg-primary" : "bg-muted-foreground/20")} />
            )}
          </div>
          <div className="flex-1 pb-2">
            <div className={cn("text-sm font-medium", !step.done && !step.active && "text-muted-foreground")}>
              {step.label}
            </div>
            {step.ts && <div className="text-xs text-muted-foreground">{fmt(step.ts)}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
