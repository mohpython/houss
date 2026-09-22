import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  searchPlacesPharmaciesAdmin,
  registerPlacePharmacyAdmin,
} from "@/lib/pharmacy.functions";
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
  const [gmapsQuery, setGmapsQuery] = useState("");
  const [gmapsResults, setGmapsResults] = useState<Array<{
    placeId: string;
    name: string;
    address: string;
    phone: string | null;
    rating: number | null;
    lat: number | null;
    lng: number | null;
    localPharmacyId: string | null;
  }> | null>(null);
  const [gmapsLoading, setGmapsLoading] = useState(false);
  const [registering, setRegistering] = useState<string | null>(null);
  const searchFn = useServerFn(searchPlacesPharmaciesAdmin);
  const registerFn = useServerFn(registerPlacePharmacyAdmin);

  const loadPharms = () => {
    supabase
      .from("pharmacies")
      .select("id, name, address, city")
      .eq("status", "approved")
      .order("name")
      .then(({ data }) => setPharms((data as Pharm[]) ?? []));
  };

  useEffect(() => {
    loadPharms();
  }, []);

  const searchGmaps = async (e: React.FormEvent) => {
    e.preventDefault();
    if (gmapsQuery.trim().length < 2) return;
    setGmapsLoading(true);
    try {
      const res = await searchFn({ data: { query: gmapsQuery.trim() } });
      setGmapsResults(res.places);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setGmapsLoading(false);
    }
  };

  const registerGmaps = async (p: NonNullable<typeof gmapsResults>[number]) => {
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
      setGmapsResults((r) =>
        r?.map((x) => (x.placeId === p.placeId ? { ...x, localPharmacyId: res.id } : x)) ?? null,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setRegistering(null);
    }
  };


  const loadInv = async (pharmacyId: string) => {
    setRows(null);
    const { data } = await supabase
      .from("inventory")
      .select("id, stock_qty, price, medicines(id, normalized_name, strength, generic_name)")
      .eq("pharmacy_id", pharmacyId);
    setRows((data as unknown as Row[]) ?? []);
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
      const normalized = form.name.trim().toLowerCase();
      const { data: existing } = await supabase
        .from("medicines")
        .select("id")
        .eq("normalized_name", normalized)
        .eq("strength", form.strength || "")
        .maybeSingle();
      let medId = existing?.id;
      if (!medId) {
        const { data: newMed, error: mErr } = await supabase
          .from("medicines")
          .insert({
            normalized_name: normalized,
            generic_name: form.generic || null,
            strength: form.strength || null,
          })
          .select("id")
          .single();
        if (mErr) throw mErr;
        medId = newMed.id;
      }
      const { error } = await supabase.from("inventory").upsert(
        {
          pharmacy_id: selected,
          medicine_id: medId,
          stock_qty: Number(form.stock) || 0,
          price: form.price ? Number(form.price) : null,
        },
        { onConflict: "pharmacy_id,medicine_id" },
      );
      if (error) throw error;
      setForm({ name: "", generic: "", strength: "", stock: "1", price: "" });
      toast.success("Ajouté");
      loadInv(selected);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const remove = async (id: string) => {
    await supabase.from("inventory").delete().eq("id", id);
    if (selected) loadInv(selected);
  };

  const setStock = async (id: string, stock: number) => {
    setRows((r) => r?.map((row) => (row.id === id ? { ...row, stock_qty: stock } : row)) ?? null);
    await supabase.from("inventory").update({ stock_qty: stock }).eq("id", id);
  };

  const setPrice = async (id: string, price: number | null) => {
    setRows((r) => r?.map((row) => (row.id === id ? { ...row, price } : row)) ?? null);
    await supabase.from("inventory").update({ price }).eq("id", id);
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
          <h2 className="font-semibold">Ajouter une pharmacie depuis Google Maps</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Recherchez une pharmacie (ville, quartier ou nom), enregistrez-la puis gérez son stock.
        </p>
        <form onSubmit={searchGmaps} className="mt-3 flex gap-2">
          <Input
            placeholder="Ex : Cocody Abidjan, Pharmacie de la Paix…"
            value={gmapsQuery}
            onChange={(e) => setGmapsQuery(e.target.value)}
          />
          <Button type="submit" disabled={gmapsLoading}>
            <Search className="mr-2 h-4 w-4" />
            {gmapsLoading ? "…" : "Rechercher"}
          </Button>
        </form>
        {gmapsResults && gmapsResults.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">Aucun résultat.</p>
        )}
        {gmapsResults && gmapsResults.length > 0 && (
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {gmapsResults.map((p) => (
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
                    onClick={() => registerGmaps(p)}
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
              <div className="p-4 text-sm text-muted-foreground">
                Aucune pharmacie approuvée.
              </div>
            )}
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  selected === p.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-secondary"
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
                            <Badge variant="secondary" className="bg-destructive/10 text-destructive">
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
