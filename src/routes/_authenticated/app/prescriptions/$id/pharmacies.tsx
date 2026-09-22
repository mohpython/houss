import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { findNearbyPharmaciesPlaces, createReservation } from "@/lib/pharmacy.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Star, Phone, Check, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { DeliveryLocationPicker, type DeliveryLocation } from "@/components/DeliveryLocationPicker";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/app/prescriptions/$id/pharmacies")({
  component: Pharmacies,
});

type Pharm = {
  placeId: string;
  localPharmacyId: string | null;
  name: string;
  address: string;
  phone: string | null;
  rating: number | null;
  openNow: boolean | null;
  mapsUri: string | null;
  distanceKm: number | null;
  availableCount: number;
  totalItems: number;
  registered: boolean;
  availability: Array<{ itemId: string; name: string; available: boolean; price: number | null }>;
};

function Pharmacies() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const router = useRouter();
  const [deliveryLoc, setDeliveryLoc] = useState<DeliveryLocation | null>(null);
  const findFn = useServerFn(findNearbyPharmaciesPlaces);
  const createRes = useServerFn(createReservation);
  const [pharms, setPharms] = useState<Pharm[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [reserving, setReserving] = useState<string | null>(null);
  const [itemsAll, setItemsAll] = useState<string[]>([]);
  // null = unknown, true = current user owns the prescription, false = viewing someone else's (admin)
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  useEffect(() => {
    supabase
      .from("prescription_items")
      .select("id")
      .eq("prescription_id", id)
      .then(({ data }) => setItemsAll((data ?? []).map((i) => i.id)));
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data: rx } = await supabase
        .from("prescriptions")
        .select("patient_id")
        .eq("id", id)
        .maybeSingle();
      setIsOwner(!!rx && !!auth.user && rx.patient_id === auth.user.id);
    })();
  }, [id]);

  const load = async (coords: { lat: number; lng: number }) => {
    setLoading(true);
    setPharms(null);
    try {
      const res = await findFn({
        data: { prescriptionId: id, lat: coords.lat, lng: coords.lng },
      });
      setPharms(res.pharmacies as Pharm[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recherche échouée");
      setPharms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!deliveryLoc) return;
    const c = { lat: deliveryLoc.lat, lng: deliveryLoc.lng };
    setLoc(c);
    void load(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryLoc?.mode, deliveryLoc?.lat, deliveryLoc?.lng]);

  const reserve = async (pharm: Pharm) => {
    if (!pharm.localPharmacyId) return;
    setReserving(pharm.placeId);
    try {
      const availIds = pharm.availability.filter((a) => a.available).map((a) => a.itemId);
      const ids = availIds.length > 0 ? availIds : itemsAll;
      const res = await createRes({
        data: {
          prescriptionId: id,
          pharmacyId: pharm.localPharmacyId,
          itemIds: ids,
          patientLat: deliveryLoc?.mode === "gps" ? deliveryLoc.lat : undefined,
          patientLng: deliveryLoc?.mode === "gps" ? deliveryLoc.lng : undefined,
          neighborhoodId: deliveryLoc?.mode === "neighborhood" ? deliveryLoc.neighborhoodId : undefined,
          patientAddress: deliveryLoc?.detail?.trim() || undefined,
        },
      });
      toast.success("Réservation créée");
      router.navigate({ to: "/app/reservations/$id/checkout", params: { id: res.id } });

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setReserving(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pharmacies proches</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Résultats en direct via Google Maps autour de votre position.
          </p>
        </div>
      </div>

      <Card className="mt-6 p-4">
        <h2 className="mb-1 text-sm font-semibold">{t("delivery.where")}</h2>
        <p className="mb-3 text-xs text-muted-foreground">{t("delivery.whereHint")}</p>
        <DeliveryLocationPicker value={deliveryLoc} onChange={setDeliveryLoc} disabled={loading} />
      </Card>

      {isOwner === false && (
        <Card className="mt-6 border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
          Cette ordonnance appartient à un autre patient. Vous pouvez consulter les pharmacies,
          mais seul le patient propriétaire peut réserver.
        </Card>
      )}

      {!loc && !loading && (
        <Card className="mt-6 p-6 text-center text-sm text-muted-foreground">
          {t("delivery.chooseFirst")}
        </Card>
      )}

      <div className="mt-6 space-y-3">
        {loading && (
          <>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        )}
        {pharms?.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Aucune pharmacie trouvée dans un rayon de 5 km.
          </Card>
        )}
        {pharms?.map((p) => (
          <Card key={p.placeId} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  {p.rating ? (
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                      <Star className="h-3 w-3 fill-warning text-warning" /> {p.rating.toFixed(1)}
                    </span>
                  ) : null}
                  {p.openNow === true && (
                    <Badge variant="secondary" className="bg-success/10 text-success">Ouvert</Badge>
                  )}
                  {p.openNow === false && (
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">Fermé</Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {p.address}
                  </span>
                  {p.phone && (
                    <a href={`tel:${p.phone}`} className="flex items-center gap-1 hover:text-primary">
                      <Phone className="h-3 w-3" />
                      {p.phone}
                    </a>
                  )}
                  {p.distanceKm != null && (
                    <span className="rounded-full bg-secondary px-2 py-0.5">{p.distanceKm.toFixed(1)} km</span>
                  )}
                </div>
              </div>
              {p.registered ? (
                <Badge
                  variant="secondary"
                  className={
                    p.availableCount === p.totalItems
                      ? "bg-success/10 text-success"
                      : p.availableCount > 0
                        ? "bg-warning/10 text-warning"
                        : "bg-destructive/10 text-destructive"
                  }
                >
                  {p.availableCount}/{p.totalItems} disponibles
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-muted text-muted-foreground">
                  Stock non renseigné
                </Badge>
              )}
            </div>

            {p.registered && p.availability.length > 0 && (
              <div className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
                {p.availability.map((a) => (
                  <div key={a.itemId} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-1.5">
                    <span className="flex items-center gap-2 truncate">
                      {a.available ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-destructive" />
                      )}
                      <span className="truncate">{a.name}</span>
                    </span>
                    {a.price != null && (
                      <span className="text-xs text-muted-foreground">{a.price} FCFA</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {p.registered && (
                <Button
                  onClick={() => reserve(p)}
                  disabled={reserving === p.placeId || p.availableCount === 0 || isOwner === false}
                  title={isOwner === false ? "Seul le patient propriétaire peut réserver" : undefined}
                >
                  {reserving === p.placeId ? "Réservation…" : "Réserver ici"}
                </Button>
              )}
              {p.phone && (
                <Button variant="outline" asChild>
                  <a href={`tel:${p.phone}`}>
                    <Phone className="mr-2 h-4 w-4" />
                    Appeler
                  </a>
                </Button>
              )}
              {p.mapsUri && (
                <Button variant="outline" asChild>
                  <a href={p.mapsUri} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Voir sur Maps
                  </a>
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
