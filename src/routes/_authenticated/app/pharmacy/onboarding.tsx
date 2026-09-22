import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/pharmacy/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const [blocked, setBlocked] = useState<null | "pharmacy" | "courier">(null);
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({
    name: "",
    license_number: "",
    address: "",
    city: "",
    phone: "",
    lat: "",
    lng: "",
    google_place_id: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const check = async () => {
      const [owned, staff, courier] = await Promise.all([
        supabase.from("pharmacies").select("id").eq("owner_user_id", user.id).maybeSingle(),
        supabase.from("pharmacy_staff").select("id").eq("user_id", user.id).maybeSingle(),
        supabase.from("couriers").select("id").eq("user_id", user.id).maybeSingle(),
      ]);
      if (owned.data || staff.data) setBlocked("pharmacy");
      else if (courier.data) setBlocked("courier");
      setChecking(false);
    };
    check();
  }, [user.id]);


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from("pharmacies").insert({
        owner_user_id: user.id,
        name: form.name,
        license_number: form.license_number,
        address: form.address,
        city: form.city || null,
        phone: form.phone || null,
        lat: form.lat ? Number(form.lat) : null,
        lng: form.lng ? Number(form.lng) : null,
        google_place_id: form.google_place_id || null,
        status: "pending",
      });
      if (error) throw error;
      toast.success("Demande envoyée. En attente de validation.");
      router.navigate({ to: "/app" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const detect = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setForm((f) => ({
          ...f,
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        })),
      () => toast.error("Localisation refusée"),
    );
  };

  if (checking) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;

  if (blocked) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Inscription impossible</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {blocked === "pharmacy"
            ? "Ce compte gère déjà une pharmacie. Un compte ne peut gérer qu'une seule pharmacie."
            : "Ce compte est déjà livreur. Un compte ne peut pas être à la fois livreur et gérant de pharmacie."}
        </p>
      </div>
    );
  }

  return (

    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Inscrire une pharmacie</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Un administrateur validera votre licence avant l'activation du compte.
      </p>
      <Card className="mt-6 p-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nom de la pharmacie</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="license">Numéro de licence</Label>
            <Input
              id="license"
              value={form.license_number}
              onChange={(e) => setForm({ ...form, license_number: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Adresse</Label>
            <Textarea
              id="address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="city">Ville</Label>
              <Input
                id="city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Téléphone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="lat">Latitude</Label>
              <Input
                id="lat"
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lng">Longitude</Label>
              <Input
                id="lng"
                value={form.lng}
                onChange={(e) => setForm({ ...form, lng: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={detect}>
                Localiser
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="place">Google Place ID (optionnel)</Label>
            <Input
              id="place"
              placeholder="ChIJ…"
              value={form.google_place_id}
              onChange={(e) => setForm({ ...form, google_place_id: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Permet aux patients de voir vos stocks dans les résultats Google Maps. Trouvez-le sur{" "}
              <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                Place ID Finder
              </a>.
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Envoi…" : "Soumettre pour validation"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
