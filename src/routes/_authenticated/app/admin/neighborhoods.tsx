import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listNeighborhoods,
  upsertNeighborhood,
  toggleNeighborhood,
  type Neighborhood,
} from "@/lib/neighborhoods.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Plus, Pencil, Search, Save, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/admin/neighborhoods")({
  head: () => ({
    meta: [
      { title: "Quartiers de livraison — Admin SAHA Santé" },
      { name: "description", content: "Gérez les quartiers de Bamako proposés comme lieux de livraison." },
      { property: "og:title", content: "Quartiers de livraison — Admin SAHA Santé" },
      { property: "og:description", content: "Gérez les quartiers proposés comme lieux de livraison." },
    ],
  }),
  component: AdminNeighborhoods,
});

type Form = { id?: string; name: string; city: string; lat: string; lng: string; is_active: boolean };
const EMPTY: Form = { name: "", city: "Bamako", lat: "", lng: "", is_active: true };

function AdminNeighborhoods() {
  const listFn = useServerFn(listNeighborhoods);
  const saveFn = useServerFn(upsertNeighborhood);
  const toggleFn = useServerFn(toggleNeighborhood);
  const [rows, setRows] = useState<Neighborhood[] | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    try {
      setRows(await listFn({ data: { includeInactive: true } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chargement impossible");
      setRows([]);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q) || r.city.toLowerCase().includes(q));
  }, [rows, query]);

  const save = async () => {
    if (!form) return;
    const lat = Number(form.lat.replace(",", "."));
    const lng = Number(form.lng.replace(",", "."));
    if (!form.name.trim() || Number.isNaN(lat) || Number.isNaN(lng)) {
      toast.error("Nom, latitude et longitude sont obligatoires");
      return;
    }
    setSaving(true);
    try {
      await saveFn({
        data: { id: form.id, name: form.name.trim(), city: form.city.trim() || "Bamako", lat, lng, is_active: form.is_active },
      });
      toast.success(form.id ? "Quartier mis à jour" : "Quartier ajouté");
      setForm(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (n: Neighborhood, next: boolean) => {
    setRows((r) => (r ?? []).map((x) => (x.id === n.id ? { ...x, is_active: next } : x)));
    try {
      await toggleFn({ data: { id: n.id, is_active: next } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Mise à jour impossible");
      await reload();
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link to="/app/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à l'administration
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quartiers de livraison</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Liste des quartiers que les patients peuvent choisir comme lieu de livraison.
          </p>
        </div>
        <Button className="min-h-[44px]" onClick={() => setForm({ ...EMPTY })}>
          <Plus className="mr-2 h-4 w-4" /> Ajouter un quartier
        </Button>
      </div>

      {form && (
        <Card className="mt-6 p-5">
          <h2 className="text-lg font-semibold">{form.id ? "Modifier le quartier" : "Nouveau quartier"}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nb-name">Nom du quartier</Label>
              <Input id="nb-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex : Daoudabougou" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-city">Ville</Label>
              <Input id="nb-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-lat">Latitude</Label>
              <Input id="nb-lat" inputMode="decimal" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="12.59" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-lng">Longitude</Label>
              <Input id="nb-lng" inputMode="decimal" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="-7.98" />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="nb-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label htmlFor="nb-active">Visible pour les patients</Label>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Astuce : ouvrez Google Maps, faites un clic droit sur le centre du quartier et copiez les coordonnées.
          </p>
          <div className="mt-4 flex gap-2">
            <Button onClick={save} disabled={saving} className="min-h-[44px]">
              <Save className="mr-2 h-4 w-4" /> Enregistrer
            </Button>
            <Button variant="ghost" onClick={() => setForm(null)} disabled={saving} className="min-h-[44px]">
              <X className="mr-2 h-4 w-4" /> Annuler
            </Button>
          </div>
        </Card>
      )}

      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un quartier…" className="pl-9" aria-label="Rechercher un quartier" />
      </div>

      <div className="mt-4 space-y-2">
        {rows === null && (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        )}
        {rows !== null && filtered.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">Aucun quartier.</Card>
        )}
        {filtered.map((n) => (
          <Card key={n.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MapPin className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{n.name}</p>
                  {!n.is_active && <Badge variant="secondary">Masqué</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {n.city} · {n.lat.toFixed(4)}, {n.lng.toFixed(4)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id={`active-${n.id}`}
                  checked={n.is_active}
                  onCheckedChange={(v) => toggle(n, v)}
                  aria-label={`Activer ${n.name}`}
                />
                <Label htmlFor={`active-${n.id}`} className="text-xs text-muted-foreground">Actif</Label>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[40px]"
                onClick={() =>
                  setForm({ id: n.id, name: n.name, city: n.city, lat: String(n.lat), lng: String(n.lng), is_active: n.is_active })
                }
              >
                <Pencil className="mr-2 h-4 w-4" /> Modifier
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
