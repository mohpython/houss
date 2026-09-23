import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getWhatsappOverview,
  listWhatsappTemplates,
  saveWhatsappTemplate,
  type WaOrder,
  type WaSession,
  type WaTemplate,
} from "@/lib/whatsapp-admin.functions";
import { listNeighborhoods, toggleNeighborhood, type Neighborhood } from "@/lib/neighborhoods.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, MessageCircle, MapPin, RefreshCw, Save, RotateCcw, Store, Bike, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/admin/whatsapp")({
  head: () => ({
    meta: [
      { title: "Bot WhatsApp — Admin SAHA Santé" },
      { name: "description", content: "Suivi des commandes WhatsApp, quartiers et messages types du bot." },
      { property: "og:title", content: "Bot WhatsApp — Admin SAHA Santé" },
      { property: "og:description", content: "Suivi des commandes WhatsApp, quartiers et messages types." },
    ],
  }),
  component: AdminWhatsapp,
});

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
const STATE_FR: Record<string, string> = {
  idle: "Menu",
  awaiting_rx: "Attend la photo",
  awaiting_confirm: "Attend confirmation",
  awaiting_location: "Attend le lieu",
  awaiting_free_order: "Attend la liste",
};

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (["rejected", "cancelled", "failed"].includes(s)) return "destructive";
  if (["completed", "delivered"].includes(s)) return "default";
  if (["pending", "unassigned"].includes(s)) return "outline";
  return "secondary";
}

function AdminWhatsapp() {
  const overviewFn = useServerFn(getWhatsappOverview);
  const [orders, setOrders] = useState<WaOrder[] | null>(null);
  const [sessions, setSessions] = useState<WaSession[]>([]);
  const [query, setQuery] = useState("");

  const load = async () => {
    try {
      const r = await overviewFn();
      setOrders(r.orders);
      setSessions(r.sessions);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement impossible");
      setOrders([]);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (orders ?? []).filter(
      (o) =>
        !q ||
        [o.patient_name, o.patient_phone, o.neighborhood, o.pharmacy, o.courier, o.id.slice(0, 8)]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [orders, query]);

  const kpi = useMemo(() => {
    const o = orders ?? [];
    return {
      total: o.length,
      active: o.filter((x) => !["completed", "rejected", "cancelled"].includes(x.status)).length,
      delivered: o.filter((x) => x.delivery_status === "delivered" || x.status === "completed").length,
      sessions: sessions.length,
    };
  }, [orders, sessions]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link to="/app/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à l'administration
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MessageCircle className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Bot WhatsApp</h1>
            <p className="text-sm text-muted-foreground">Commandes reçues, quartiers et messages types.</p>
          </div>
        </div>
        <Button variant="outline" className="min-h-[44px]" onClick={load}>
          <RefreshCw className="mr-2 h-4 w-4" /> Actualiser
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Commandes WhatsApp", kpi.total],
          ["En cours", kpi.active],
          ["Livrées", kpi.delivered],
          ["Conversations", kpi.sessions],
        ].map(([l, v]) => (
          <Card key={String(l)} className="p-4">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="mt-1 text-2xl font-bold">{orders === null ? "…" : v}</p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="orders" className="mt-6">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="orders" className="min-h-[40px]">Suivi des commandes</TabsTrigger>
          <TabsTrigger value="sessions" className="min-h-[40px]">Conversations</TabsTrigger>
          <TabsTrigger value="templates" className="min-h-[40px]">Messages types</TabsTrigger>
          <TabsTrigger value="neighborhoods" className="min-h-[40px]">Quartiers</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher : nom, téléphone, quartier, pharmacie, référence…"
              className="pl-9"
              aria-label="Rechercher une commande WhatsApp"
            />
          </div>
          <div className="mt-4 space-y-2">
            {orders === null && (
              <>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </>
            )}
            {orders !== null && filtered.length === 0 && (
              <Card className="p-8 text-center text-sm text-muted-foreground">Aucune commande WhatsApp.</Card>
            )}
            {filtered.map((o) => (
              <Card key={o.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">#{o.id.slice(0, 8).toUpperCase()}</span>
                      <p className="font-semibold">{o.patient_name ?? "Client WhatsApp"}</p>
                      {o.patient_phone && <span className="text-sm text-muted-foreground">{o.patient_phone}</span>}
                      {o.is_partial && <Badge variant="outline">Partielle</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("fr-FR")} · {Math.round(o.total_amount).toLocaleString("fr-FR")} FCFA ·{" "}
                      {o.payment_status === "paid" ? "Payée" : "Paiement en attente"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={statusVariant(o.status)}>Commande : {STATUS_FR[o.status] ?? o.status}</Badge>
                    {o.fulfillment_method === "pickup" ? (
                      <Badge variant="secondary">Retrait en pharmacie</Badge>
                    ) : (
                      <Badge variant={statusVariant(o.delivery_status)}>
                        Livraison : {STATUS_FR[o.delivery_status] ?? o.delivery_status}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <p className="font-medium">{o.neighborhood ?? (o.delivery_mode === "gps" ? "Position GPS" : "Quartier inconnu")}</p>
                      {o.patient_address && <p className="text-xs text-muted-foreground">{o.patient_address}</p>}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Store className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="font-medium">{o.pharmacy ?? "—"}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Bike className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="font-medium">{o.fulfillment_method === "pickup" ? "Sans livreur" : (o.courier ?? "Non assigné")}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="sessions" className="mt-4 space-y-2">
          {sessions.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">Aucune conversation.</Card>
          )}
          {sessions.map((s) => (
            <Card key={s.wa_phone} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{s.wa_name ?? s.wa_phone}</p>
                <p className="text-xs text-muted-foreground">
                  {s.wa_phone} · {s.language.toUpperCase()} ·{" "}
                  {s.last_message_at ? new Date(s.last_message_at).toLocaleString("fr-FR") : "—"}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary">{STATE_FR[s.state] ?? s.state}</Badge>
                <Badge variant={s.linked ? "default" : "outline"}>{s.linked ? "Compte lié" : "Sans compte"}</Badge>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <TemplatesEditor />
        </TabsContent>

        <TabsContent value="neighborhoods" className="mt-4">
          <NeighborhoodsQuick />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function TemplatesEditor() {
  const listFn = useServerFn(listWhatsappTemplates);
  const saveFn = useServerFn(saveWhatsappTemplate);
  const [rows, setRows] = useState<WaTemplate[] | null>(null);
  const [lang, setLang] = useState<"fr" | "en" | "ar">("fr");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    try {
      setRows(await listFn());
      setDrafts({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement impossible");
      setRows([]);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (key: WaTemplate["key"], body: string) => {
    setSaving(`${key}:${lang}`);
    try {
      await saveFn({ data: { key, lang, body } });
      toast.success(body.trim() ? "Message enregistré" : "Message réinitialisé");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(null);
    }
  };

  if (rows === null) return <Skeleton className="h-40 w-full" />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Modifiez les réponses automatiques envoyées aux clients. Les mots entre accolades (ex. {"{pharmacy}"}) sont remplacés automatiquement.
        </p>
        <div className="flex gap-1 rounded-lg border p-1">
          {(["fr", "en", "ar"] as const).map((l) => (
            <Button key={l} size="sm" variant={lang === l ? "default" : "ghost"} onClick={() => setLang(l)} className="min-h-[36px]">
              {l === "fr" ? "Français" : l === "en" ? "English" : "العربية"}
            </Button>
          ))}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((t) => {
          const id = `${t.key}:${lang}`;
          const current = t.values[lang];
          const value = drafts[id] ?? current.body;
          const dirty = value !== current.body;
          return (
            <Card key={t.key} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{t.label}</p>
                  {current.custom && <Badge variant="secondary">Personnalisé</Badge>}
                </div>
                {t.placeholders.length > 0 && (
                  <p className="text-xs text-muted-foreground">Variables : {t.placeholders.map((p) => `{${p}}`).join(", ")}</p>
                )}
              </div>
              <textarea
                dir={lang === "ar" ? "rtl" : "ltr"}
                aria-label={`${t.label} (${lang})`}
                className="mt-2 min-h-[96px] w-full rounded-md border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={value}
                onChange={(e) => setDrafts({ ...drafts, [id]: e.target.value })}
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="min-h-[40px]" disabled={!dirty || saving === id} onClick={() => save(t.key, value)}>
                  <Save className="mr-2 h-4 w-4" /> Enregistrer
                </Button>
                {current.custom && (
                  <Button size="sm" variant="ghost" className="min-h-[40px]" disabled={saving === id} onClick={() => save(t.key, "")}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Rétablir le texte par défaut
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function NeighborhoodsQuick() {
  const listFn = useServerFn(listNeighborhoods);
  const toggleFn = useServerFn(toggleNeighborhood);
  const [rows, setRows] = useState<Neighborhood[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    listFn({ data: { includeInactive: true } })
      .then(setRows)
      .catch(() => setRows([]));
  }, [listFn]);

  const toggle = async (n: Neighborhood, next: boolean) => {
    setRows((r) => (r ?? []).map((x) => (x.id === n.id ? { ...x, is_active: next } : x)));
    try {
      await toggleFn({ data: { id: n.id, is_active: next } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    }
  };

  const filtered = (rows ?? []).filter((n) => !q || n.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Les clients WhatsApp peuvent écrire le nom de l'un de ces quartiers pour se faire livrer ailleurs. Les quartiers inactifs ne sont pas reconnus.
        </p>
        <Button asChild variant="outline" className="min-h-[44px]">
          <Link to="/app/admin/neighborhoods">
            <MapPin className="mr-2 h-4 w-4" /> Ajouter / modifier les quartiers
          </Link>
        </Button>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un quartier…" className="mt-4" aria-label="Rechercher un quartier" />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows === null && <Skeleton className="h-14 w-full" />}
        {filtered.map((n) => (
          <Card key={n.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{n.name}</p>
              <p className="text-xs text-muted-foreground">{n.city}</p>
            </div>
            <Switch checked={n.is_active} onCheckedChange={(v) => toggle(n, v)} aria-label={`Activer ${n.name}`} />
          </Card>
        ))}
      </div>
    </div>
  );
}
