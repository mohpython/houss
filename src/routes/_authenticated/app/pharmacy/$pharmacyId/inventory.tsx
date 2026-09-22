import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/pharmacy/$pharmacyId/inventory")({
  component: Inventory,
});

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

function Inventory() {
  const { pharmacyId } = Route.useParams();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [form, setForm] = useState({ name: "", generic: "", strength: "", stock: "1", price: "" });

  const fetchInventory = useServerFn(listPharmacyInventory);
  const upsertItem = useServerFn(upsertInventoryItem);
  const updateItem = useServerFn(updateInventoryItem);
  const deleteItem = useServerFn(deleteInventoryItem);

  const load = async () => {
    try {
      const data = await fetchInventory({ data: { pharmacyId } });
      setRows((data as Row[]) ?? []);
    } catch {
      setRows([]);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pharmacyId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsertItem({
        data: {
          pharmacyId,
          name: form.name,
          generic: form.generic,
          strength: form.strength,
          stock: Number(form.stock) || 0,
          price: form.price ? Number(form.price) : null,
        },
      });
      setForm({ name: "", generic: "", strength: "", stock: "1", price: "" });
      toast.success("Ajouté");
      load();
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
    load();
  };

  const setStock = async (id: string, stock: number) => {
    setRows((r) => r?.map((row) => (row.id === id ? { ...row, stock_qty: stock } : row)) ?? null);
    try {
      await updateItem({ data: { id, stock_qty: stock } });
    } catch {
      // ignoré, comme avant
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold">Inventaire</h2>
      <Card className="mt-3 p-4">
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
            <Label htmlFor="prc">Prix</Label>
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
              Ajouter
            </Button>
          </div>
        </form>
      </Card>

      <div className="mt-4 space-y-2">
        {rows === null && <Skeleton className="h-16 w-full" />}
        {rows?.length === 0 && (
          <Card className="p-4 text-sm text-muted-foreground">Aucun article.</Card>
        )}
        {rows?.map((r) => (
          <Card key={r.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {r.medicines?.normalized_name} {r.medicines?.strength}
              </div>
              {r.medicines?.generic_name && (
                <div className="text-xs text-muted-foreground">{r.medicines.generic_name}</div>
              )}
            </div>
            <Input
              type="number"
              min="0"
              className="w-20"
              value={r.stock_qty}
              onChange={(e) => setStock(r.id, Number(e.target.value))}
            />
            {r.price != null && <div className="w-20 text-right text-sm">{r.price} FCFA</div>}
            <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
