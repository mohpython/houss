import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCourierOnboardingState } from "@/lib/courier.functions";
import { registerCourier } from "@/lib/delivery.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/courier/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const register = useServerFn(registerCourier);
  const [existing, setExisting] = useState<{ status: string } | null | undefined>(undefined);
  const [isPharmacy, setIsPharmacy] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    vehicleType: "moto",
    licenseNumber: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const state = await getCourierOnboardingState().catch(() => null);
      setIsPharmacy(!!state?.isPharmacy);
      setExisting(state?.courier ?? null);
    };
    load();
  }, [user.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register({ data: form });
      toast.success("Inscription envoyée — en attente de validation admin");
      router.navigate({ to: "/app/courier" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  if (existing === undefined) return <div className="p-8">Chargement…</div>;
  if (!existing && isPharmacy) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Inscription impossible</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ce compte gère déjà une pharmacie. Un compte ne peut pas être à la fois gérant de
          pharmacie et livreur.
        </p>
      </div>
    );
  }

  if (existing) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">
          Inscription {existing.status === "pending" ? "en attente" : existing.status}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {existing.status === "pending" && "Un admin doit valider votre compte livreur."}
          {existing.status === "approved" && "Votre compte livreur est actif."}
        </p>
        <Link to="/app/courier" className="mt-4 inline-block text-primary hover:underline">
          Aller au tableau de bord →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Devenir livreur</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Remplissez ce formulaire, un admin validera votre inscription.
      </p>
      <Card className="mt-6 p-6">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Nom complet</Label>
            <Input
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </div>
          <div>
            <Label>Téléphone</Label>
            <Input
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <Label>Type de véhicule</Label>
            <select
              className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
              value={form.vehicleType}
              onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
            >
              <option value="moto">Moto</option>
              <option value="voiture">Voiture</option>
              <option value="vélo">Vélo</option>
            </select>
          </div>
          <div>
            <Label>N° permis (facultatif)</Label>
            <Input
              value={form.licenseNumber}
              onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Envoi…" : "S'inscrire"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
