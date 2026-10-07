import {
  getPractitionerResponseStats,
  type PractitionerResponseStats,
} from "@/lib/practitioner.functions";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyRoles } from "@/lib/account.functions";
import { listSpecialties } from "@/lib/health.functions";
import {
  listPractitionersAdmin,
  upsertPractitioner,
  setPractitionerStatus,
  deletePractitioner,
  type AdminPractitionerRow,
} from "@/lib/practitioner-admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingButton } from "@/components/ui/loading-button";
import { ListSkeleton } from "@/components/ui/skeletons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Stethoscope, Plus, Trash2, Pencil, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/app/admin/practitioners")({
  component: AdminPractitioners,
});

type Specialty = {
  code: string;
  label_fr: string;
  practitioner_type: "doctor" | "nurse";
};

type FormState = {
  id?: string;
  full_name: string;
  type: "doctor" | "nurse";
  specialty_code: string;
  license_number: string;
  phone: string;
  address: string;
  city: string;
  lat: string;
  lng: string;
  home_visits: boolean;
  consultation_fee: string;
  is_available: boolean;
  status: "pending" | "approved" | "rejected";
  bio: string;
  claim_email: string;
};

const emptyForm: FormState = {
  full_name: "",
  type: "doctor",
  specialty_code: "",
  license_number: "",
  phone: "",
  address: "",
  city: "",
  lat: "",
  lng: "",
  home_visits: false,
  consultation_fee: "",
  is_available: true,
  status: "approved",
  bio: "",
  claim_email: "",
};

function AdminPractitioners() {
  const { t } = useTranslation();
  const { user } = Route.useRouteContext();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<AdminPractitionerRow[] | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const list = useServerFn(listPractitionersAdmin);
  const loadStats = useServerFn(getPractitionerResponseStats);
  const [stats, setStats] = useState<PractitionerResponseStats>({});
  const upsert = useServerFn(upsertPractitioner);
  const setStatus = useServerFn(setPractitionerStatus);
  const remove = useServerFn(deletePractitioner);
  const fetchRoles = useServerFn(getMyRoles);
  const fetchSpecialties = useServerFn(listSpecialties);

  useEffect(() => {
    fetchRoles()
      .then((roles) => setIsAdmin(roles.includes("admin")))
      .catch(() => setIsAdmin(false));
  }, [user.id]);

  const load = async () => {
    try {
      const [data, spec] = await Promise.all([
        list(),
        fetchSpecialties().catch(() => [] as Specialty[]),
      ]);
      setRows(data);
      setSpecialties((spec as Specialty[]) ?? []);
      loadStats()
        .then(setStats)
        .catch(() => setStats({}));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
      setRows([]);
    }
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const startEdit = (p: AdminPractitionerRow) => {
    setForm({
      id: p.id,
      full_name: p.full_name,
      type: p.type,
      specialty_code: p.specialty_code,
      license_number: p.license_number ?? "",
      phone: p.phone ?? "",
      address: p.address ?? "",
      city: p.city ?? "",
      lat: p.lat != null ? String(p.lat) : "",
      lng: p.lng != null ? String(p.lng) : "",
      home_visits: p.home_visits,
      consultation_fee: p.consultation_fee != null ? String(p.consultation_fee) : "",
      is_available: p.is_available,
      status: p.status,
      bio: p.bio ?? "",
      claim_email: p.claim_email ?? "",
    });
    setOpen(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    if (!form.full_name.trim() || !form.specialty_code) {
      toast.error(t("pr.required"));
      return;
    }
    setBusy(true);
    try {
      await upsert({
        data: {
          id: form.id,
          full_name: form.full_name.trim(),
          type: form.type,
          specialty_code: form.specialty_code,
          license_number: form.license_number.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          city: form.city.trim() || null,
          lat: form.lat ? Number(form.lat) : null,
          lng: form.lng ? Number(form.lng) : null,
          home_visits: form.home_visits,
          consultation_fee: form.consultation_fee ? Number(form.consultation_fee) : null,
          is_available: form.is_available,
          status: form.status,
          bio: form.bio.trim() || null,
          claim_email: form.claim_email.trim() ? form.claim_email.trim() : null,
        },
      });
      toast.success(form.id ? t("pr.updated") : t("pr.added"));
      setForm(emptyForm);
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const act = async (id: string, status: "approved" | "rejected" | "pending") => {
    try {
      await setStatus({ data: { id, status } });
      toast.success(t("pr.statusUpdated"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const del = async (id: string) => {
    try {
      await remove({ data: { id } });
      toast.success(t("pr.deleted"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  if (isAdmin === null)
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  if (!isAdmin)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{t("pr.adminOnly")}</h1>
      </div>
    );

  const typeSpecialties = specialties.filter((s) => s.practitioner_type === form.type);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">{t("pr.title")}</h1>
        </div>
        <Button
          variant={open ? "outline" : "default"}
          className="gap-2"
          onClick={() => {
            if (open) {
              setOpen(false);
              setForm(emptyForm);
            } else {
              setForm(emptyForm);
              setOpen(true);
            }
          }}
        >
          {open ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {open ? t("pr.close") : t("pr.addBtn")}
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("pr.subtitle")}
      </p>

      {open && (
        <Card className="mt-6 space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("pr.nameLabel")}</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder={t("pr.namePh")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("pr.typeLabel")}</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm({ ...form, type: v as "doctor" | "nurse", specialty_code: "" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="doctor">{t("role.doctor")}</SelectItem>
                  <SelectItem value="nurse">{t("role.nurse")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("pr.specialtyLabel")}</Label>
              <Select
                value={form.specialty_code}
                onValueChange={(v) => setForm({ ...form, specialty_code: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("pr.specialtyPh")} />
                </SelectTrigger>
                <SelectContent>
                  {typeSpecialties.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.label_fr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("pr.claimEmailLabel")}</Label>
              <Input
                type="email"
                value={form.claim_email}
                onChange={(e) => setForm({ ...form, claim_email: e.target.value })}
                placeholder={t("pr.claimEmailPh")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("pr.phoneLabel")}</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("pr.licenseLabel")}</Label>
              <Input
                value={form.license_number}
                onChange={(e) => setForm({ ...form, license_number: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("pr.addressLabel")}</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.city")}</Label>
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("pr.feeLabel")}</Label>
              <Input
                inputMode="decimal"
                value={form.consultation_fee}
                onChange={(e) => setForm({ ...form, consultation_fee: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.latitude")}</Label>
              <Input
                inputMode="decimal"
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })}
                placeholder="12.6392"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.longitude")}</Label>
              <Input
                inputMode="decimal"
                value={form.lng}
                onChange={(e) => setForm({ ...form, lng: e.target.value })}
                placeholder="-8.0029"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("pr.bioLabel")}</Label>
              <Textarea
                rows={3}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("pr.statusLabel")}</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as FormState["status"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">{t("pr.stApproved")}</SelectItem>
                  <SelectItem value="pending">{t("pr.stPending")}</SelectItem>
                  <SelectItem value="rejected">{t("pr.stRejected")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-6 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.home_visits}
                  onCheckedChange={(v) => setForm({ ...form, home_visits: v })}
                />
                {t("pr.homeVisits")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.is_available}
                  onCheckedChange={(v) => setForm({ ...form, is_available: v })}
                />
                {t("pr.available")}
              </label>
            </div>
          </div>
          <LoadingButton onClick={save} loading={busy} className="gap-2">
            <Plus className="h-4 w-4" />
            {form.id ? t("common.save") : t("pr.create")}
          </LoadingButton>
        </Card>
      )}

      <h2 className="mt-8 text-lg font-semibold">{t("pr.listTitle")}</h2>
      <div className="mt-3 space-y-2">
        {rows === null && <ListSkeleton rows={3} rowClassName="h-20" />}
        {rows?.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            {t("pr.empty")}
          </Card>
        )}
        {rows?.map((p) => (
          <Card key={p.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{p.full_name}</span>
                <Badge variant="secondary">{p.type === "doctor" ? t("role.doctor") : t("role.nurse")}</Badge>
                <Badge
                  variant="secondary"
                  className={
                    p.status === "approved"
                      ? "bg-success/10 text-success"
                      : p.status === "rejected"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-warning/10 text-warning"
                  }
                >
                  {p.status}
                </Badge>
                {p.home_visits && <Badge variant="outline">{t("pr.homeBadge")}</Badge>}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {specialties.find((s) => s.code === p.specialty_code)?.label_fr ?? p.specialty_code}
                {p.city ? ` · ${p.city}` : ""}
                {p.phone ? ` · ${p.phone}` : ""}
              </div>
              {stats[p.id] && (
                <div className="mt-1 flex flex-wrap gap-1 text-xs">
                  <Badge
                    variant="outline"
                    className={stats[p.id].pending > 0 ? "border-warning/50 text-warning" : ""}
                  >
                    {stats[p.id].pending} {t(stats[p.id].pending > 1 ? "pr.requests" : "pr.request")} {t("pr.pending")}
                  </Badge>
                  {stats[p.id].avgResponseHours !== null && (
                    <Badge variant="outline">
                      {t("pr.avgResp")}{" "}
                      {stats[p.id].avgResponseHours! < 1
                        ? `${Math.round(stats[p.id].avgResponseHours! * 60)} min`
                        : `${stats[p.id].avgResponseHours!.toFixed(1)} h`}
                    </Badge>
                  )}
                </div>
              )}
              <div className="mt-1 text-xs text-muted-foreground">
                {p.owner_email
                  ? `${t("pr.accountPrefix")} ${p.owner_email}`
                  : p.claim_email
                    ? `${t("pr.invitePrefix")} ${p.claim_email}`
                    : t("pr.noAccount")}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="gap-2" onClick={() => startEdit(p)}>
                <Pencil className="h-4 w-4" /> {t("nbh.edit")}
              </Button>
              {p.status !== "approved" && (
                <Button size="sm" onClick={() => act(p.id, "approved")}>
                  {t("courier.validateBtn")}
                </Button>
              )}
              {p.status !== "rejected" && (
                <Button size="sm" variant="outline" onClick={() => act(p.id, "rejected")}>
                  {t("pr.suspend")}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="gap-2 text-destructive"
                onClick={() => del(p.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
