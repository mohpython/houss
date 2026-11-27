import { useEffect, useState } from "react";
import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import {
  Building2,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  listDoctorSpecialties,
  updateDoctorSettings,
  type DoctorProfile,
} from "@/lib/doctor-rx.functions";
import { formatDateFr } from "@/components/doctor-rx/rx-ui";

const appRoute = getRouteApi("/medecin/app");

export const Route = createFileRoute("/medecin/app/parametres")({
  component: DoctorSettingsPage,
});

type Specialty = {
  code: string;
  label_fr: string;
  label_en: string;
  label_ar: string;
  practitioner_type: "doctor" | "nurse";
  keywords: string[];
};

function DoctorSettingsPage() {
  const { session } = appRoute.useRouteContext();
  const router = useRouter();
  const me = session.practitioner as DoctorProfile;
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: me?.full_name ?? "",
    specialtyCode: me?.specialty_code ?? "",
    licenseNumber: me?.license_number ?? "",
    phone: me?.phone ?? "",
    address: me?.address ?? "",
    city: me?.city ?? "",
    establishmentName: me?.establishment_name ?? "",
    establishmentAddress: me?.establishment_address ?? "",
    establishmentPhone: me?.establishment_phone ?? "",
    establishmentEmail: me?.establishment_email ?? "",
    signatureNote: me?.signature_note ?? "",
  });

  useEffect(() => {
    let alive = true;
    listDoctorSpecialties()
      .then((rows) => alive && setSpecialties(rows))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.specialtyCode) {
      toast.error("Le nom et la spécialité sont obligatoires.");
      return;
    }
    setSaving(true);
    try {
      await updateDoctorSettings({ data: form });
      toast.success("Paramètres enregistrés. Ils s'appliqueront aux prochaines ordonnances.");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2ee0aa]">
          Espace médecin
        </p>
        <h1 className="font-display text-3xl text-white sm:text-4xl">Paramètres</h1>
        <p className="mt-1 text-xs text-[#9fc4b9]">
          Ces informations apparaissent sur vos ordonnances et sur le cachet numérique.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[22px] border border-emerald-300/20 bg-emerald-400/10 px-4 py-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-emerald-100">Compte médecin approuvé</p>
          <p className="text-[10px] text-emerald-100/70">
            {session.user.email || session.user.phone} · approuvé le{" "}
            {formatDateFr(me?.approved_at)}
          </p>
        </div>
        <span className="rx-chip border border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
          <ShieldCheck className="h-3 w-3" />
          Signature active
        </span>
      </div>

      <form onSubmit={save} className="space-y-3">
        <section className="rx-card rounded-[26px] p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#072b26]">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
              <UserRound className="h-3.5 w-3.5" />
            </span>
            Identité professionnelle
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="rx-label">Nom complet *</span>
              <input value={form.fullName} onChange={set("fullName")} className="rx-field" />
            </label>
            <label className="block">
              <span className="rx-label">Spécialité *</span>
              <select value={form.specialtyCode} onChange={set("specialtyCode")} className="rx-field">
                {specialties.length === 0 && (
                  <option value={form.specialtyCode}>{me?.specialty_label ?? form.specialtyCode}</option>
                )}
                {specialties.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label_fr}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="rx-label">N° professionnel / ordre</span>
              <input
                value={form.licenseNumber}
                onChange={set("licenseNumber")}
                placeholder="Ex. ML-2024-0917"
                className="rx-field"
              />
            </label>
            <label className="block">
              <span className="rx-label">Téléphone professionnel</span>
              <input value={form.phone} onChange={set("phone")} className="rx-field" />
            </label>
          </div>
        </section>

        <section className="rx-card rounded-[26px] p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#072b26]">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
              <Building2 className="h-3.5 w-3.5" />
            </span>
            Établissement & en-tête du document
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="rx-label">Nom de l'établissement</span>
              <input
                value={form.establishmentName}
                onChange={set("establishmentName")}
                placeholder="Ex. Centre de Santé de l'Amitié"
                className="rx-field"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="rx-label">Adresse de l'établissement</span>
              <input
                value={form.establishmentAddress}
                onChange={set("establishmentAddress")}
                placeholder="Ex. Hamdallaye ACI 2000, Bamako"
                className="rx-field"
              />
            </label>
            <label className="block">
              <span className="rx-label">Téléphone de l'établissement</span>
              <input
                value={form.establishmentPhone}
                onChange={set("establishmentPhone")}
                className="rx-field"
              />
            </label>
            <label className="block">
              <span className="rx-label">E-mail de l'établissement</span>
              <input
                type="email"
                value={form.establishmentEmail}
                onChange={set("establishmentEmail")}
                className="rx-field"
              />
            </label>
            <label className="block">
              <span className="rx-label">Ville</span>
              <input value={form.city} onChange={set("city")} placeholder="Bamako" className="rx-field" />
            </label>
            <label className="block">
              <span className="rx-label">Adresse du cabinet</span>
              <input value={form.address} onChange={set("address")} className="rx-field" />
            </label>
            <label className="block sm:col-span-2">
              <span className="rx-label">Mention du cachet numérique</span>
              <input
                value={form.signatureNote}
                onChange={set("signatureNote")}
                placeholder="Ex. Médecin généraliste — exercice libéral"
                className="rx-field"
              />
            </label>
          </div>
        </section>

        <section className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <LockKeyhole className="h-4 w-4 text-[#2ee0aa]" />
            Signature électronique
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-[#9fc4b9]">
            La signature est protégée par votre mot de passe et scellée par un HMAC-SHA256 calculé
            côté serveur. Elle couvre l'identité du médecin, du patient, le diagnostic, les
            médicaments et l'horodatage.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              ["Méthode", "HMAC-SHA256"],
              ["Vérification", "QR + page publique"],
              ["Archivage", "PDF + SHA-256"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#7da69b]">
                  {label}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-[#7da69b]">
            Pour modifier votre mot de passe, utilisez la page de réinitialisation SAHA Santé.
          </p>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/[0.04] p-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#8fb8ac]">
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {session.user.email || "—"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {session.user.phone || "—"}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {form.city || "Bamako"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Stethoscope className="h-3 w-3" />
              {me?.status === "approved" ? "Approuvé" : me?.status}
            </span>
          </div>
          <button type="submit" disabled={saving} className="rx-btn-primary px-5 py-2.5 text-sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Enregistrement…" : "Enregistrer les paramètres"}
          </button>
        </div>
      </form>
    </div>
  );
}
