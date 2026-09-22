import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { approveCourier, deleteCourier } from "@/lib/delivery.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/admin/couriers")({
  component: AdminCouriers,
  head: () => ({
    meta: [
      { title: "Livreurs — Administration SAHA Santé" },
      {
        name: "description",
        content: "Validez, refusez ou supprimez les livreurs partenaires de SAHA Santé.",
      },
      { property: "og:title", content: "Livreurs — Administration SAHA Santé" },
      { property: "og:description", content: "Gestion des livreurs partenaires SAHA Santé." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type C = {
  id: string;
  full_name: string;
  phone: string;
  vehicle_type: string;
  license_number: string | null;
  status: string;
  created_at: string;
};

function AdminCouriers() {
  const { user } = Route.useRouteContext();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<C[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const approve = useServerFn(approveCourier);
  const remove = useServerFn(deleteCourier);

  useEffect(() => {
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user.id]);

  const load = async () => {
    const { data } = await supabase
      .from("couriers")
      .select("id, full_name, phone, vehicle_type, license_number, status, created_at")
      .order("created_at", { ascending: false });
    setRows((data as C[]) ?? []);
  };
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const act = async (courierId: string, decision: "approved" | "rejected") => {
    try {
      await approve({ data: { courierId, decision } });
      toast.success("Mis à jour");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const del = async (c: C) => {
    setBusy(c.id);
    try {
      await remove({ data: { courierId: c.id } });
      toast.success(`${c.full_name} supprimé`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  const statusLabel = (s: string) =>
    s === "approved" ? "Validé" : s === "rejected" ? "Refusé" : "En attente";

  if (isAdmin === null)
    return (
      <div className="p-8">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  if (!isAdmin) return <div className="p-16 text-center">Accès réservé aux administrateurs</div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Livreurs</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Validez, refusez ou supprimez un livreur. La suppression est impossible s'il a une livraison en cours.
      </p>
      <div className="mt-6 space-y-3">
        {rows === null && <Skeleton className="h-24 w-full" />}
        {rows?.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">Aucun livreur.</Card>
        )}
        {rows?.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{c.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.phone} · {c.vehicle_type} {c.license_number ? `· Permis ${c.license_number}` : ""}
                </div>
              </div>
              <Badge
                variant="secondary"
                className={
                  c.status === "approved"
                    ? "bg-success/10 text-success"
                    : c.status === "rejected"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-warning/10 text-warning"
                }
              >
                {statusLabel(c.status)}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {c.status === "pending" && (
                <>
                  <Button size="sm" className="min-h-11" onClick={() => act(c.id, "approved")}>
                    Approuver {c.full_name}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => act(c.id, "rejected")}
                  >
                    Refuser {c.full_name}
                  </Button>
                </>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" className="min-h-11" disabled={busy === c.id}>
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    Supprimer {c.full_name}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer ce livreur ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {c.full_name} sera retiré définitivement de la plateforme et perdra son rôle de
                      livreur. Les livraisons déjà terminées restent enregistrées.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => del(c)}>Supprimer</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

