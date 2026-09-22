import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  medicines: { id: string; normalized_name: string; strength: string | null; generic_name: string | null } | null;
};

function Inventory() {
  const { pharmacyId } = Route.useParams();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [form, setForm] = useState({ name: "", generic: "", strength: "", stock: "1", price: "" });

  const load = async () => {
    const { data } = await supabase
      .from("inventory")
      .select("id, stock_qty, price, medicines(id, normalized_name, strength, generic_name)")
      .eq("pharmacy_id", pharmacyId);
    setRows((data as unknown as Row[]) ?? []);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pharmacyId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const { error } = await supabase
        .from("inventory")
        .upsert(
          {
            pharmacy_id: pharmacyId,
            medicine_id: medId,
            stock_qty: Number(form.stock) || 0,
            price: form.price ? Number(form.price) : null,
          },
          { onConflict: "pharmacy_id,medicine_id" },
        );
      if (error) throw error;
      setForm({ name: "", generic: "", strength: "", stock: "1", price: "" });
      toast.success("Ajouté");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const remove = async (id: string) => {
    await supabase.from("inventory").delete().eq("id", id);
    load();
  };

  const setStock = async (id: string, stock: number) => {
    setRows((r) => r?.map((row) => (row.id === id ? { ...row, stock_qty: stock } : row)) ?? null);
    await supabase.from("inventory").update({ stock_qty: stock }).eq("id", id);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold">Inventaire</h2>
      <Card className="mt-3 p-4">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-6">
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="mname">Médicament</Label>
            <Input id="mname" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gen">Générique</Label>
            <Input id="gen" value={form.generic} onChange={(e) => setForm({ ...form, generic: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="str">Dosage</Label>
            <Input id="str" placeholder="500 mg" value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stk">Stock</Label>
            <Input id="stk" type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="prc">Prix</Label>
            <Input id="prc" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
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
