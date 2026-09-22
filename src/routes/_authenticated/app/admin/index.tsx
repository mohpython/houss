import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getAdminDashboard, getIsAdmin } from "@/lib/admin-data.functions";
import { subscribeRealtime } from "@/integrations/realtime/client";
import { approvePharmacy } from "@/lib/pharmacy.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  MapPin,
  Store,
  Users,
  Package,
  Truck,
  ShieldCheck,
  ShieldAlert,
  Bike,
  Boxes,
  UserCog,
  Stethoscope,
  CalendarClock,
  MessageSquareHeart,
  Search,
  ChevronRight,
  MessageCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/admin/")({
  component: Admin,
  head: () => ({
    meta: [
      { title: "Administration — SAHA Santé" },
      {
        name: "description",
        content:
          "Tableau de bord administrateur SAHA Santé : pharmacies, stocks, livreurs, praticiens, rendez-vous et avis clients.",
      },
      { property: "og:title", content: "Administration — SAHA Santé" },
      {
        property: "og:description",
        content: "Pilotez pharmacies, stocks, livreurs et rendez-vous depuis un seul écran.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Ph = {
  id: string;
  name: string;
  license_number: string;
  address: string;
  city: string | null;
  status: string;
  created_at: string;
};
type Global = { pharmacies: number; couriers: number; active: number; delivered: number };

type Section = {
  title: string;
  items: {
    to: string;
    icon: React.ReactNode;
    label: string;
    desc: string;
  }[];
};

function Admin() {
  const [rows, setRows] = useState<Ph[] | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [global, setGlobal] = useState<Global>({
    pharmacies: 0,
    couriers: 0,
    active: 0,
    delivered: 0,
  });
  const approve = useServerFn(approvePharmacy);
  const { user } = Route.useRouteContext();

  const checkAdmin = useServerFn(getIsAdmin);
  const fetchDashboard = useServerFn(getAdminDashboard);

  useEffect(() => {
    checkAdmin()
      .then((r) => setIsAdmin(r.isAdmin))
      .catch(() => setIsAdmin(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const load = async () => {
    try {
      const d = await fetchDashboard();
      setRows((d.pharmacies as Ph[]) ?? []);
      setGlobal(d.global);
    } catch {
      setRows([]);
    }
  };
  useEffect(() => {
    if (!isAdmin) return;
    load();
    return subscribeRealtime(
      [
        { table: "reservations", event: "*" },
        { table: "pharmacies", event: "*" },
      ],
      () => load(),
      { onResync: () => load() },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const act = async (pharmacyId: string, decision: "approved" | "rejected") => {
    try {
      await approve({ data: { pharmacyId, decision } });
      toast.success("Mis à jour");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const sections: Section[] = useMemo(
    () => [
      {
        title: "Pharmacies & stocks",
        items: [
          {
            to: "/app/admin/pharmacies",
            icon: <Store className="h-5 w-5" />,
            label: "Gérants pharmacies",
            desc: "Attribuer une pharmacie par email",
          },
          {
            to: "/app/admin/inventory",
            icon: <Boxes className="h-5 w-5" />,
            label: "Stocks pharmacies",
            desc: "Gérer l'inventaire global",
          },
        ],
      },
      {
        title: "Livraison",
        items: [
          {
            to: "/app/admin/couriers",
            icon: <Bike className="h-5 w-5" />,
            label: "Livreurs",
            desc: "Validation et suivi des livreurs",
          },
          {
            to: "/app/admin/neighborhoods",
            icon: <MapPin className="h-5 w-5" />,
            label: "Quartiers",
            desc: "Quartiers proposés comme lieux de livraison",
          },
        ],
      },
      {
        title: "Santé",
        items: [
          {
            to: "/app/admin/practitioners",
            icon: <Stethoscope className="h-5 w-5" />,
            label: "Praticiens",
            desc: "Médecins et infirmiers",
          },
          {
            to: "/app/admin/appointments",
            icon: <CalendarClock className="h-5 w-5" />,
            label: "Rendez-vous",
            desc: "Patients et praticiens assignés",
          },
          {
            to: "/app/admin/reviews",
            icon: <ShieldAlert className="h-5 w-5" />,
            label: "Ordonnances à vérifier",
            desc: "Documents signalés par l'IA",
          },
        ],
      },
      {
        title: "Utilisateurs & retours",
        items: [
          {
            to: "/app/admin/feedback",
            icon: <MessageSquareHeart className="h-5 w-5" />,
            label: "Avis clients",
            desc: "Notes et remarques après commande",
          },
          {
            to: "/app/admin/patients",
            icon: <UserCog className="h-5 w-5" />,
            label: "Patients & rôles",
            desc: "Rôles, quartier et historique de commandes",
          },
          {
            to: "/app/admin/whatsapp",
            icon: <MessageCircle className="h-5 w-5" />,
            label: "Bot WhatsApp",
            desc: "Commandes reçues, quartiers et messages types",
          },
        ],
      },
    ],
    [],
  );

  const q = query.trim().toLowerCase();
  const filtered = sections
    .map((s) => ({
      ...s,
      items: s.items.filter(
        (i) => !q || i.label.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q),
      ),
    }))
    .filter((s) => s.items.length > 0);

  if (isAdmin === null)
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Accès réservé aux administrateurs</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Contactez un administrateur pour obtenir le rôle « admin ».
        </p>
      </div>
    );
  }

  const pending = rows?.filter((p) => p.status === "pending") ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight">Administration</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Tout se gère ici : pharmacies, stocks, livreurs, praticiens et avis.
        </p>
      </header>

      {pending.length > 0 && (
        <Card className="mt-6 flex flex-wrap items-center justify-between gap-3 border-warning/40 bg-warning/5 p-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-warning" aria-hidden="true" />
            <div>
              <div className="font-semibold">
                {pending.length} pharmacie{pending.length > 1 ? "s" : ""} en attente de validation
              </div>
              <div className="text-xs text-muted-foreground">À traiter en bas de cette page.</div>
            </div>
          </div>
          <Button asChild size="sm" className="min-h-11">
            <a href="#validation">Traiter maintenant</a>
          </Button>
        </Card>
      )}

      <section
        aria-label="Statistiques globales"
        className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <Kpi icon={<Store className="h-4 w-4" />} label="Pharmacies" value={global.pharmacies} />
        <Kpi icon={<Users className="h-4 w-4" />} label="Livreurs" value={global.couriers} />
        <Kpi
          icon={<Package className="h-4 w-4" />}
          label="Commandes actives"
          value={global.active}
          tone="warning"
        />
        <Kpi
          icon={<Truck className="h-4 w-4" />}
          label="Livrées"
          value={global.delivered}
          tone="success"
        />
      </section>

      <div className="mt-8">
        <label htmlFor="admin-search" className="text-sm font-medium">
          Rechercher une section
        </label>
        <div className="relative mt-2">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="admin-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex. stocks, livreurs, avis…"
            className="h-11 pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          Aucune section ne correspond à « {query} ».
        </p>
      )}

      {filtered.map((s) => (
        <section key={s.title} className="mt-8" aria-labelledby={`sec-${slug(s.title)}`}>
          <h2
            id={`sec-${slug(s.title)}`}
            className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {s.title}
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {s.items.map((i) => (
              <li key={i.to}>
                <Link
                  to={i.to}
                  className="flex min-h-16 items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                    aria-hidden="true"
                  >
                    {i.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{i.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{i.desc}</span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section id="validation" className="mt-10 scroll-mt-20" aria-labelledby="sec-validation">
        <h2 id="sec-validation" className="text-lg font-semibold">
          Validation des pharmacies
        </h2>
        <div className="mt-3 space-y-3">
          {rows === null && <Skeleton className="h-24 w-full" />}
          {rows?.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">Aucune demande.</Card>
          )}
          {rows?.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Licence : {p.license_number} · {p.address}
                    {p.city ? `, ${p.city}` : ""}
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={
                    p.status === "approved"
                      ? "bg-success/10 text-success"
                      : p.status === "rejected"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-warning/10 text-warning"
                  }
                >
                  {p.status === "approved"
                    ? "Approuvée"
                    : p.status === "rejected"
                      ? "Refusée"
                      : "En attente"}
                </Badge>
              </div>
              {p.status === "pending" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" className="min-h-11" onClick={() => act(p.id, "approved")}>
                    Approuver {p.name}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => act(p.id, "rejected")}
                  >
                    Refuser {p.name}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function slug(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-");
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
  tone?: "warning" | "success";
}) {
  const t =
    tone === "warning"
      ? "bg-warning/10 text-warning"
      : tone === "success"
        ? "bg-success/10 text-success"
        : "bg-primary/10 text-primary";
  return (
    <Card className="p-3">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${t}`}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}
