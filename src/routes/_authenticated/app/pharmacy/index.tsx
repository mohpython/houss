import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/ui/skeletons";
import { Package, Clock, CheckCircle2, Truck, Store, Boxes, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/app/pharmacy/")({
  component: Layout,
  head: () => ({
    meta: [
      { title: "Espace pharmacie — SAHA Santé" },
      {
        name: "description",
        content:
          "Gérez vos commandes, vos stocks et vos retraits en pharmacie depuis un tableau de bord simple et clair.",
      },
      { property: "og:title", content: "Espace pharmacie — SAHA Santé" },
      {
        property: "og:description",
        content: "Commandes, stocks et retraits en un coup d'œil pour votre pharmacie.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Ph = { id: string; name: string; status: string };
type Stats = { pending: number; accepted: number; ready: number; completed: number };

function Layout() {
  const { t } = useTranslation();
  const { user } = Route.useRouteContext();
  const [pharms, setPharms] = useState<Ph[] | null>(null);
  const [statsByPharm, setStatsByPharm] = useState<Record<string, Stats>>({});

  useEffect(() => {
    supabase
      .from("pharmacies")
      .select("id, name, status")
      .eq("owner_user_id", user.id)
      .then(({ data }) => setPharms((data as Ph[]) ?? []));
  }, [user.id]);

  useEffect(() => {
    if (!pharms || pharms.length === 0) return;
    const ids = pharms.map((p) => p.id);
    const load = async () => {
      const { data } = await supabase
        .from("reservations")
        .select("pharmacy_id, status")
        .in("pharmacy_id", ids);
      const map: Record<string, Stats> = {};
      for (const id of ids) map[id] = { pending: 0, accepted: 0, ready: 0, completed: 0 };
      for (const r of data ?? []) {
        const s = map[r.pharmacy_id];
        if (!s) continue;
        if (r.status === "pending") s.pending++;
        else if (r.status === "accepted") s.accepted++;
        else if (r.status === "ready") s.ready++;
        else if (r.status === "completed") s.completed++;
      }
      setStatsByPharm(map);
    };
    load();
    const ch = supabase
      .channel(`pharm-owner-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [pharms, user.id]);

  const statusLabel = (s: string) =>
    s === "approved" ? "Validée" : s === "rejected" ? "Refusée" : "En attente de validation";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header>
        <div className="flex items-center gap-2">
          <Store className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight">{t("pharm.title")}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Deux boutons suffisent : voir les commandes, ou mettre à jour le stock.
        </p>
      </header>

      {pharms === null && <ListSkeleton className="mt-6" rows={2} rowClassName="h-24" />}
      {pharms?.length === 0 && (
        <Card className="mt-6 p-6 text-sm text-muted-foreground">
          {t("pharm.none")}{" "}
          <Link className="text-primary underline-offset-2 hover:underline" to="/app/pharmacy/onboarding">
            {t("pharm.register")}
          </Link>
        </Card>
      )}

      {pharms?.map((p) => {
        const s = statsByPharm[p.id] ?? { pending: 0, accepted: 0, ready: 0, completed: 0 };
        const approved = p.status === "approved";
        return (
          <Card key={p.id} className="mt-6 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{p.name}</h2>
                <Badge
                  variant="secondary"
                  className={`mt-1 ${approved ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
                >
                  {statusLabel(p.status)}
                </Badge>
              </div>
            </div>

            {approved && (
              <>
                {s.pending > 0 && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Clock className="h-4 w-4 text-warning" aria-hidden="true" />
                      {s.pending} nouvelle{s.pending > 1 ? "s" : ""} commande{s.pending > 1 ? "s" : ""} à traiter
                    </div>
                    <Button asChild size="sm" className="min-h-11">
                      <Link to="/app/pharmacy/$pharmacyId/reservations" params={{ pharmacyId: p.id }}>
                        Traiter maintenant
                      </Link>
                    </Button>
                  </div>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <BigAction
                    to="/app/pharmacy/$pharmacyId/reservations"
                    pharmacyId={p.id}
                    icon={<Package className="h-5 w-5" />}
                    title={t("pharm.reservations")}
                    desc="Accepter, préparer et remettre les commandes"
                  />
                  <BigAction
                    to="/app/pharmacy/$pharmacyId/inventory"
                    pharmacyId={p.id}
                    icon={<Boxes className="h-5 w-5" />}
                    title={t("pharm.inventory")}
                    desc="Ajouter des médicaments et modifier les prix"
                  />
                </div>

                <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Aujourd'hui en chiffres
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Kpi icon={<Clock className="h-4 w-4" />} label={t("pharm.new")} value={s.pending} tone="warning" />
                  <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label={t("pharm.accepted")} value={s.accepted} />
                  <Kpi icon={<Package className="h-4 w-4" />} label={t("pharm.ready")} value={s.ready} tone="primary" />
                  <Kpi icon={<Truck className="h-4 w-4" />} label={t("pharm.delivered")} value={s.completed} tone="success" />
                </div>
              </>
            )}

            {!approved && (
              <p className="mt-3 text-sm text-muted-foreground">
                Votre pharmacie sera visible par les patients dès sa validation par un administrateur.
              </p>
            )}
          </Card>
        );
      })}

      <div className="mt-8">
        <Outlet />
      </div>
    </div>
  );
}

function BigAction({
  to,
  pharmacyId,
  icon,
  title,
  desc,
}: {
  to: "/app/pharmacy/$pharmacyId/reservations" | "/app/pharmacy/$pharmacyId/inventory";
  pharmacyId: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      params={{ pharmacyId }}
      className="flex min-h-16 items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "warning" | "success" | "primary";
}) {
  const t =
    tone === "warning"
      ? "bg-warning/10 text-warning"
      : tone === "success"
        ? "bg-success/10 text-success"
        : tone === "primary"
          ? "bg-primary/10 text-primary"
          : "bg-secondary text-foreground";
  return (
    <div className="rounded-lg border p-3">
      <div className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${t}`} aria-hidden="true">
        {icon}
      </div>
      <div className="mt-2 text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
