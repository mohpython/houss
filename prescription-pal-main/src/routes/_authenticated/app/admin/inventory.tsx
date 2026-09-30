import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  searchPlacesPharmaciesAdmin,
  registerPlacePharmacyAdmin,
  registerManualPharmacyAdmin,
} from "@/lib/pharmacy.functions";
import { listApprovedPharmacies } from "@/lib/admin-data.functions";
import {
  deleteInventoryItem,
  listPharmacyInventory,
  updateInventoryItem,
  upsertInventoryItem,
} from "@/lib/pharmacy-portal.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Trash2, Search, Store, AlertTriangle, MapPin, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/admin/inventory")({
  component: AdminInventory,
});

type Pharm = { id: string; name: string; address: string | null; city: string | null };
type Row = {
  id: string;
  stock_qty: number;
  price: number | null;
  medicines: {
    id: string;
    normalized_name: string;
    strength: string | null;
    generic_name: string | null;
  } | null;
};

const LOW_STOCK = 5;

function AdminInventory() {
  const [pharms, setPharms] = useState<Pharm[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [form, setForm] = useState({
    name: "",
    generic: "",
    strength: "",
    stock: "1",
    price: "",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{
    placeId: string;
    name: string;
    address: string;
    phone: string | null;
    rating: number | null;
    lat: number | null;
    lng: number | null;
    localPharmacyId: string | null;
  }> | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [registering, setRegistering] = useState<string | null>(null);
  const [manual, setManual] = useState({ name: "", address: "", phone: "" });
  const [manualSaving, setManualSaving] = useState(false);
  const searchFn = useServerFn(searchPlacesPharmaciesAdmin);
  const registerFn = useServerFn(registerPlacePharmacyAdmin);
  const registerManualFn = useServerFn(registerManualPharmacyAdmin);

  const fetchPharms = useServerFn(listApprovedPharmacies);
  const fetchInventory = useServerFn(listPharmacyInventory);
  const upsertItem = useServerFn(upsertInventoryItem);
  const updateItem = useServerFn(updateInventoryItem);
  const deleteItem = useServerFn(deleteInventoryItem);

  const loadPharms = () => {
    fetchPharms()
      .then((data) => setPharms((data as Pharm[]) ?? []))
      .catch(() => setPharms([]));
  };

  useEffect(() => {
    loadPharms();
  }, []);

  const searchPlaces = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length < 2) return;
    setSearchLoading(true);
    try {
      const res = await searchFn({ data: { query: searchQuery.trim() } });
      setSearchResults(res.places);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSearchLoading(false);
    }
  };

  const registerPlace = async (p: NonNullable<typeof searchResults>[number]) => {
    setRegistering(p.placeId);
    try {
      const res = await registerFn({
        data: {
          placeId: p.placeId,
          name: p.name,
          address: p.address,
          phone: p.phone,
          lat: p.lat,
          lng: p.lng,
        },
      });
      toast.success(res.created ? "Pharmacie ajoutée" : "Déjà enregistrée");
      loadPharms();
      setSelected(res.id);
      setSearchResults(
        (r) =>
          r?.map((x) => (x.placeId === p.placeId ? { ...x, localPharmacyId: res.id } : x)) ?? null,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setRegistering(null);
    }
  };

  // Voie « saisie manuelle » : fonctionne sans aucune API externe
  // (géocodage Nominatim côté serveur, best effort).
  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manual.name.trim() || !manual.address.trim()) return;
    setManualSaving(true);
    try {
      const res = await registerManualFn({
        data: {
          name: manual.name.trim(),
          address: manual.address.trim(),
          phone: manual.phone.trim() || null,
        },
      });
      toast.success(res.created ? "Pharmacie ajoutée (géocodée si adresse reconnue)" : "Déjà enregistrée");
      setManual({ name: "", address: "", phone: "" });
      loadPharms();
      setSelected(res.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setManualSaving(false);
    }
  };

  const loadInv = async (pharmacyId: string) => {
    setRows(null);
    try {
      const data = await fetchInventory({ data: { pharmacyId } });
      setRows((data as Row[]) ?? []);
    } catch {
      setRows([]);
    }
  };

  useEffect(() => {
    if (selected) loadInv(selected);
  }, [selected]);

  const filtered = useMemo(() => {
    if (!pharms) return [];
    const q = query.trim().toLowerCase();
    if (!q) return pharms;
    return pharms.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.city ?? "").toLowerCase().includes(q) ||
        (p.address ?? "").toLowerCase().includes(q),
    );
  }, [pharms, query]);

  const selectedPharm = pharms?.find((p) => p.id === selected) ?? null;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    try {
      await upsertItem({
        data: {
          pharmacyId: selected,
          name: form.name,
          generic: form.generic,
          strength: form.strength,
          stock: Number(form.stock) || 0,
          price: form.price ? Number(form.price) : null,
        },
      });
      setForm({ name: "", generic: "", strength: "", stock: "1", price: "" });
      toast.success("Ajouté");
      loadInv(selected);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteItem({ data: { id } });
    } catch {
      // ignoré, comme avant
    }
    if (selected) loadInv(selected);
  };

  const setStock = async (id: string, stock: number) => {
    setRows((r) => r?.map((row) => (row.id === id ? { ...row, stock_qty: stock } : row)) ?? null);
    try {
      await updateItem({ data: { id, stock_qty: stock } });
    } catch {
      // ignoré, comme avant
    }
  };

  const setPrice = async (id: string, price: number | null) => {
    setRows((r) => r?.map((row) => (row.id === id ? { ...row, price } : row)) ?? null);
    try {
      await updateItem({ data: { id, price } });
    } catch {
      // ignoré, comme avant
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stocks des pharmacies</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajoutez et mettez à jour les médicaments en stock pour chaque pharmacie approuvée.
        </p>
      </div>

      <Card className="mt-6 p-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Ajouter une pharmacie</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Recherchez une pharmacie par nom, quartier ou ville (OpenStreetMap, sans clé API),
          enregistrez-la puis gérez son stock. Si elle n'apparaît pas dans les résultats, utilisez
          la saisie manuelle ci-dessous.
        </p>
        <form onSubmit={searchPlaces} className="mt-3 flex gap-2">
          <Input
            placeholder="Ex : Cocody Abidjan, Pharmacie de la Paix…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button type="submit" disabled={searchLoading}>
            <Search className="mr-2 h-4 w-4" />
            {searchLoading ? "…" : "Rechercher"}
          </Button>
        </form>
        {searchResults && searchResults.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">Aucun résultat.</p>
        )}
        {searchResults && searchResults.length > 0 && (
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {searchResults.map((p) => (
              <div
                key={p.placeId}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{p.address}</div>
                </div>
                {p.localPharmacyId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelected(p.localPharmacyId)}
                  >
                    <Check className="mr-2 h-4 w-4 text-success" />
                    Gérer le stock
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => registerPlace(p)}
                    disabled={registering === p.placeId}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {registering === p.placeId ? "…" : "Enregistrer"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={submitManual} className="mt-4 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Saisie manuelle</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Voie de repli sans API externe : l'adresse est géocodée automatiquement via
            OpenStreetMap (si reconnue).
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Input
              placeholder="Nom de la pharmacie"
              className="min-w-[180px] flex-1"
              value={manual.name}
              onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
              required
            />
            <Input
              placeholder="Adresse (quartier, ville)"
              className="min-w-[180px] flex-1"
              value={manual.address}
              onChange={(e) => setManual((m) => ({ ...m, address: e.target.value }))}
              required
            />
            <Input
              placeholder="Téléphone (optionnel)"
              className="min-w-[140px] flex-1"
              value={manual.phone}
              onChange={(e) => setManual((m) => ({ ...m, phone: e.target.value }))}
            />
            <Button type="submit" disabled={manualSaving}>
              {manualSaving ? "…" : "Ajouter"}
            </Button>
          </div>
        </form>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="p-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une pharmacie…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="mt-3 max-h-[70vh] space-y-1 overflow-y-auto">
            {pharms === null && <Skeleton className="h-16 w-full" />}
            {pharms?.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Aucune pharmacie approuvée.</div>
            )}
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  selected === p.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                }`}
              >
                <Store className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.name}</div>
                  <div
                    className={`truncate text-xs ${
                      selected === p.id ? "text-primary-foreground/80" : "text-muted-foreground"
                    }`}
                  >
                    {p.city ?? p.address ?? ""}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <div className="min-w-0">
          {!selected && (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              Sélectionnez une pharmacie à gauche pour gérer son inventaire.
            </Card>
          )}

          {selected && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{selectedPharm?.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedPharm?.address}
                    {selectedPharm?.city ? `, ${selectedPharm.city}` : ""}
                  </p>
                </div>
              </div>

              <Card className="p-4">
                <form onSubmit={add} className="grid gap-3 sm:grid-cols-6">
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor="mname">Médicament</Label>
                    <Input
                      id="mname"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="gen">Générique</Label>
                    <Input
                      id="gen"
                      value={form.generic}
                      onChange={(e) => setForm({ ...form, generic: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="str">Dosage</Label>
                    <Input
                      id="str"
                      placeholder="500 mg"
                      value={form.strength}
                      onChange={(e) => setForm({ ...form, strength: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="stk">Stock</Label>
                    <Input
                      id="stk"
                      type="number"
                      min="0"
                      value={form.stock}
                      onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="prc">Prix (FCFA)</Label>
                    <Input
                      id="prc"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-6">
                    <Button type="submit">
                      <Plus className="mr-2 h-4 w-4" />
                      Ajouter / mettre à jour
                    </Button>
                  </div>
                </form>
              </Card>

              <div className="mt-4 space-y-2">
                {rows === null && <Skeleton className="h-16 w-full" />}
                {rows?.length === 0 && (
                  <Card className="p-4 text-sm text-muted-foreground">Aucun article.</Card>
                )}
                {rows?.map((r) => {
                  const outOfStock = r.stock_qty === 0;
                  const low = !outOfStock && r.stock_qty <= LOW_STOCK;
                  return (
                    <Card key={r.id} className="flex flex-wrap items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">
                            {r.medicines?.normalized_name} {r.medicines?.strength}
                          </span>
                          {outOfStock && (
                            <Badge
                              variant="secondary"
                              className="bg-destructive/10 text-destructive"
                            >
                              <AlertTriangle className="mr-1 h-3 w-3" /> Rupture
                            </Badge>
                          )}
                          {low && (
                            <Badge variant="secondary" className="bg-warning/10 text-warning">
                              Stock faible
                            </Badge>
                          )}
                        </div>
                        {r.medicines?.generic_name && (
                          <div className="text-xs text-muted-foreground">
                            {r.medicines.generic_name}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Label className="text-xs text-muted-foreground">Stock</Label>
                        <Input
                          type="number"
                          min="0"
                          className="w-20"
                          value={r.stock_qty}
                          onChange={(e) => setStock(r.id, Number(e.target.value))}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <Label className="text-xs text-muted-foreground">Prix</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-24"
                          value={r.price ?? ""}
                          onChange={(e) =>
                            setPrice(r.id, e.target.value === "" ? null : Number(e.target.value))
                          }
                        />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
