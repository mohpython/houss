import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listPatients,
  getPatientOrders,
  setAdminRole,
  type PatientRow,
  type PatientOrder,
} from "@/lib/patients-admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeft, Users, Search, MapPin, ShieldCheck, ShieldOff, ChevronDown, ChevronUp, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/admin/patients")({
  head: () => ({
    meta: [
      { title: "Patients & rôles — Admin SAHA Santé" },
      { name: "description", content: "Gérez les patients : rôles, quartier et historique des commandes." },
      { property: "og:title", content: "Patients & rôles — Admin SAHA Santé" },
      { property: "og:description", content: "Rôles, quartier et historique de commandes des patients." },
    ],
  }),
  component: AdminPatients,
});

const ROLE_FR: Record<string, string> = {
  patient: "Patient",
  admin: "Admin",
  pharmacy_staff: "Pharmacie",
  courier: "Livreur",
  doctor: "Médecin",
  nurse: "Infirmier",
};
const STATUS_FR: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  rejected: "Refusée",
  ready: "Prête",
  completed: "Terminée",
  cancelled: "Annulée",
  unassigned: "Sans livreur",
  assigned: "Livreur assigné",
  picked_up: "Récupérée",
  en_route: "En route",
  delivered: "Livrée",
  failed: "Échec",
};

type RoleFilter = "all" | "patient" | "admin" | "pro";

function AdminPatients() {
  const { user } = Route.useRouteContext();
  const listFn = useServerFn(listPatients);
  const ordersFn = useServerFn(getPatientOrders);
  const roleFn = useServerFn(setAdminRole);
  const [rows, setRows] = useState<PatientRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [orders, setOrders] = useState<Record<string, PatientOrder[] | undefined>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      setRows(await listFn());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement impossible");
      setRows([]);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      const isPro = r.roles.some((x) => ["pharmacy_staff", "courier", "doctor", "nurse"].includes(x));
      if (filter === "admin" && !r.roles.includes("admin")) return false;
      if (filter === "pro" && !isPro) return false;
      if (filter === "patient" && (isPro || r.roles.includes("admin"))) return false;
      return (
        !q ||
        [r.email, r.full_name, r.phone, r.neighborhood].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
      );
    });
  }, [rows, query, filter]);

  const toggleOpen = async (id: string) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (!orders[id]) {
      try {
        const list = await ordersFn({ data: { userId: id } });
        setOrders((o) => ({ ...o, [id]: list }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Historique indisponible");
        setOrders((o) => ({ ...o, [id]: [] }));
      }
    }
  };

  const setAdmin = async (r: PatientRow, admin: boolean) => {
    const label = r.full_name ?? r.email ?? r.phone ?? "cet utilisateur";
    if (!confirm(admin ? `Donner le rôle admin à ${label} ?` : `Retirer le rôle admin à ${label} ?`)) return;
    setBusy(r.user_id);
    try {
      await roleFn({ data: { userId: r.user_id, admin } });
      toast.success(admin ? "Rôle admin ajouté" : "Rôle admin retiré");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  const counts = useMemo(() => {
    const r = rows ?? [];
    return {
      total: r.length,
      admins: r.filter((x) => x.roles.includes("admin")).length,
      withOrders: r.filter((x) => x.orders_count > 0).length,
      whatsapp: r.filter((x) => x.source === "whatsapp").length,
    };
  }, [rows]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/app/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à l'administration
      </Link>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Users className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Patients & rôles</h1>
          <p className="text-sm text-muted-foreground">Comptes inscrits, rôle, quartier de livraison et historique des commandes.</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Comptes", counts.total],
          ["Admins", counts.admins],
          ["Ont commandé", counts.withOrders],
          ["Venus de WhatsApp", counts.whatsapp],
        ].map(([l, v]) => (
          <Card key={String(l)} className="p-4">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="mt-1 text-2xl font-bold">{rows === null ? "…" : v}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher : nom, email, téléphone, quartier…"
            className="pl-9"
            aria-label="Rechercher un patient"
          />
        </div>
        <div className="flex gap-1 rounded-lg border p-1" role="group" aria-label="Filtrer par rôle">
          {(
            [
              ["all", "Tous"],
              ["patient", "Patients"],
              ["pro", "Professionnels"],
              ["admin", "Admins"],
            ] as const
          ).map(([k, l]) => (
            <Button key={k} size="sm" variant={filter === k ? "default" : "ghost"} onClick={() => setFilter(k)} className="min-h-[36px]">
              {l}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {rows === null && (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        )}
        {rows !== null && filtered.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">Aucun compte trouvé.</Card>
        )}
        {filtered.map((r) => {
          const isOpen = open === r.user_id;
          const isAdmin = r.roles.includes("admin");
          const history = orders[r.user_id];
          return (
            <Card key={r.user_id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{r.full_name ?? r.email ?? r.phone ?? "Sans nom"}</p>
                    {(r.roles.length ? r.roles : ["patient"]).map((role) => (
                      <Badge key={role} variant={role === "admin" ? "default" : "secondary"}>
                        {ROLE_FR[role] ?? role}
                      </Badge>
                    ))}
                    {r.source === "whatsapp" && (
                      <Badge variant="outline" className="gap-1">
                        <MessageCircle className="h-3 w-3" /> WhatsApp
                      </Badge>
                    )}
                    {r.user_id === user.id && <Badge variant="outline">Vous</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[r.email, r.phone].filter(Boolean).join(" · ") || "—"} · Inscrit le {new Date(r.created_at).toLocaleDateString("fr-FR")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-4 w-4 text-primary" /> {r.neighborhood ?? "Quartier non renseigné"}
                    </span>
                    <span>
                      {r.orders_count} commande{r.orders_count > 1 ? "s" : ""}
                      {r.last_order_at && ` · dernière le ${new Date(r.last_order_at).toLocaleDateString("fr-FR")}`}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.user_id !== user.id && (
                    <Button
                      size="sm"
                      variant={isAdmin ? "outline" : "secondary"}
                      className="min-h-[40px]"
                      disabled={busy === r.user_id}
                      onClick={() => setAdmin(r, !isAdmin)}
                    >
                      {isAdmin ? <ShieldOff className="mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                      {isAdmin ? "Retirer admin" : "Rendre admin"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="min-h-[40px]" onClick={() => toggleOpen(r.user_id)} aria-expanded={isOpen}>
                    {isOpen ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                    Historique
                  </Button>
                </div>
              </div>

              {isOpen && (
                <div className="mt-4 border-t pt-3">
                  {history === undefined && <Skeleton className="h-12 w-full" />}
                  {history?.length === 0 && <p className="text-sm text-muted-foreground">Aucune commande.</p>}
                  <ul className="space-y-2">
                    {history?.map((o) => (
                      <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3 text-sm">
                        <div>
                          <p className="font-medium">
                            <span className="font-mono text-xs text-muted-foreground">#{o.id.slice(0, 8).toUpperCase()}</span>{" "}
                            {o.pharmacy ?? "Pharmacie —"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(o.created_at).toLocaleString("fr-FR")} · {o.neighborhood ?? o.patient_address ?? "Lieu non précisé"} ·{" "}
                            {o.source === "whatsapp" ? "WhatsApp" : "Application"} · {Math.round(o.total_amount).toLocaleString("fr-FR")} FCFA
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">{STATUS_FR[o.status] ?? o.status}</Badge>
                          {o.fulfillment_method === "pickup" ? (
                            <Badge variant="outline">Retrait</Badge>
                          ) : (
                            <Badge variant="outline">{STATUS_FR[o.delivery_status] ?? o.delivery_status}</Badge>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </main>
  );
}
