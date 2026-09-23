import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listPharmaciesWithOwners,
  assignPharmacyOwner,
  unassignPharmacyOwner,
  type PharmacyOwnerRow,
} from "@/lib/pharmacy-owner.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/ui/skeletons";
import { toast } from "sonner";
import { Store, UserCheck, MailQuestion, UserX } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/admin/pharmacies")({
  component: AdminPharmacies,
});

function AdminPharmacies() {
  const listFn = useServerFn(listPharmaciesWithOwners);
  const assignFn = useServerFn(assignPharmacyOwner);
  const unassignFn = useServerFn(unassignPharmacyOwner);

  const [rows, setRows] = useState<PharmacyOwnerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      setRows(await listFn({}));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setRows([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assign = async (id: string) => {
    const email = (emails[id] ?? "").trim();
    if (!email) return;
    setBusy(id);
    try {
      const res = await assignFn({ data: { pharmacyId: id, email } });
      toast.success(
        res.status === "assigned"
          ? "Gérant attribué"
          : "Aucun compte pour cet email — pharmacie réservée, elle sera attribuée à son inscription",
      );
      setEmails((e) => ({ ...e, [id]: "" }));
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  const unassign = async (id: string) => {
    setBusy(id);
    try {
      await unassignFn({ data: { pharmacyId: id } });
      toast.success("Gérant retiré");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center gap-2">
        <Store className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Gérants des pharmacies</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Une pharmacie appartient à un seul compte, et un compte ne peut gérer qu'une seule pharmacie.
        Un gérant ne peut pas être livreur.
      </p>

      {error && (
        <Card className="mt-6 p-6 text-sm text-destructive">{error}</Card>
      )}
      {rows === null && <ListSkeleton className="mt-6" rows={3} rowClassName="h-28" />}
      {rows?.length === 0 && !error && (
        <Card className="mt-6 p-6 text-sm text-muted-foreground">Aucune pharmacie enregistrée.</Card>
      )}

      <div className="mt-6 space-y-3">
        {rows?.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">{p.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.address}
                  {p.city ? `, ${p.city}` : ""}
                </div>
              </div>
              {p.owner_email ? (
                <Badge variant="secondary" className="bg-success/10 text-success">
                  <UserCheck className="mr-1 h-3 w-3" /> {p.owner_email}
                </Badge>
              ) : p.claim_email ? (
                <Badge variant="secondary" className="bg-warning/10 text-warning">
                  <MailQuestion className="mr-1 h-3 w-3" /> En attente · {p.claim_email}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-muted text-muted-foreground">
                  Non réclamée
                </Badge>
              )}
            </div>

            {p.owner_user_id || p.claim_email ? (
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === p.id}
                  onClick={() => unassign(p.id)}
                >
                  <UserX className="mr-1 h-4 w-4" />
                  Retirer le gérant
                </Button>
              </div>
            ) : (
              <form
                className="mt-3 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  assign(p.id);
                }}
              >
                <Input
                  type="email"
                  placeholder="email du gérant"
                  className="max-w-xs"
                  value={emails[p.id] ?? ""}
                  onChange={(e) => setEmails((s) => ({ ...s, [p.id]: e.target.value }))}
                />
                <Button size="sm" type="submit" disabled={busy === p.id}>
                  {busy === p.id ? "…" : "Attribuer"}
                </Button>
              </form>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
