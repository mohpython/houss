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
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/app/courier/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const { t } = useTranslation();
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
      toast.success(t("courier.onbSubmitted"));
      router.navigate({ to: "/app/courier" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  if (existing === undefined) return <div className="p-8">{t("common.loading")}</div>;
  if (!existing && isPharmacy) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{t("courier.onbImpossibleTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("courier.onbPharmacyConflict")}
        </p>
      </div>
    );
  }

  if (existing) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">
          {t("courier.onbTitle")} {existing.status === "pending" ? t("courier.onbPendingWord") : existing.status}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {existing.status === "pending" && t("courier.onbAdminPending")}
          {existing.status === "approved" && t("courier.onbActive")}
        </p>
        <Link to="/app/courier" className="mt-4 inline-block text-primary hover:underline">
          {t("courier.onbGoDashboard")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{t("nav.becomeCourier")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("courier.onbSubtitle")}
      </p>
      <Card className="mt-6 p-6">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>{t("common.fullName")}</Label>
            <Input
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("courier.onbPhone")}</Label>
            <Input
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("courier.onbVehicle")}</Label>
            <select
              className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
              value={form.vehicleType}
              onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
            >
              <option value="moto">{t("courier.vehMoto")}</option>
              <option value="voiture">{t("courier.vehVoiture")}</option>
              <option value="vélo">{t("courier.vehVelo")}</option>
            </select>
          </div>
          <div>
            <Label>{t("courier.onbLicense")}</Label>
            <Input
              value={form.licenseNumber}
              onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? t("courier.onbSending") : t("courier.onbSubmit")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
