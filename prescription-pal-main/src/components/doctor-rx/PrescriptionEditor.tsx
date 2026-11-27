import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookMarked,
  CheckCircle2,
  ChevronDown,
  Eye,
  FileCheck2,
  Loader2,
  LockKeyhole,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  saveDoctorPrescription,
  signDoctorPrescription,
  sendDoctorPrescription,
  listDoctorTemplates,
  type DoctorProfile,
  type PatientSearchResult,
} from "@/lib/doctor-rx.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PatientPicker } from "./PatientPicker";
import { RxDocument } from "./RxDocument";
import { doctorDisplay, formatDateFr, patientCode } from "./rx-ui";
import { cn } from "@/lib/utils";

export type EditorItem = {
  key: string;
  medicineName: string;
  dosage: string;
  form: string;
  quantity: string;
  posology: string;
  frequency: string;
  duration: string;
  route: string;
  instructions: string;
};

export type EditorRx = {
  id: string;
  number: string;
  version: number;
  status: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
  patient_email: string | null;
  patient_birth_date: string | null;
  patient_sex: string | null;
  consultation_date: string;
  diagnosis: string | null;
  reason: string | null;
  observations: string | null;
  advice: string | null;
  identity_verified: boolean;
  signed_at: string | null;
  signature_hash: string | null;
  establishment_name: string;
  establishment_address: string | null;
  establishment_phone: string | null;
  doctor_name: string;
  doctor_specialty: string | null;
  doctor_license: string | null;
  verification_token: string;
  items: Array<{
    medicine_name: string;
    dosage: string | null;
    form: string | null;
    quantity: string | null;
    posology: string | null;
    frequency: string | null;
    duration: string | null;
    route: string | null;
    instructions: string | null;
  }>;
};

type Template = {
  id: string;
  name: string;
  diagnosis: string | null;
  advice: string | null;
  items: unknown;
};

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `item-${Math.random().toString(36).slice(2)}`;
}

export function emptyItem(): EditorItem {
  return {
    key: uid(),
    medicineName: "",
    dosage: "",
    form: "",
    quantity: "",
    posology: "",
    frequency: "",
    duration: "",
    route: "",
    instructions: "",
  };
}

function todayKey() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const FORMS = ["Comprimé", "Gélule", "Sirop", "Suspension", "Injectable", "Pommade", "Crème", "Gouttes", "Suppositoire", "Sachet", "Spray"];
const ROUTES = ["Orale", "Intraveineuse", "Intramusculaire", "Sous-cutanée", "Rectale", "Cutanée", "Oculaire", "Nasale", "Inhalée"];

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="rx-label">{label}</span>
      {children}
    </label>
  );
}

export function ItemEditor({
  item,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  item: EditorItem;
  index: number;
  onChange: (patch: Partial<EditorItem>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="overflow-hidden rounded-2xl border border-[#dcebe6] bg-white">
      <div className="flex items-center gap-2 border-b border-[#edf4f1] bg-[#f7fbf9] px-3 py-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#e2f7ee] text-[10px] font-bold text-[#047857]">
          {index + 1}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
        >
          <span className="truncate text-xs font-bold text-[#072b26]">
            {item.medicineName || "Nouveau médicament"}
          </span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 text-[#7a978f] transition", !open && "-rotate-90")}
          />
        </button>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="grid h-7 w-7 place-items-center rounded-full text-[#9b6b6b] transition hover:bg-rose-50 hover:text-rose-600"
            aria-label={`Supprimer le médicament ${index + 1}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="grid gap-2.5 p-3 sm:grid-cols-2">
          <Field label="Médicament *" className="sm:col-span-2">
            <input
              value={item.medicineName}
              onChange={(e) => onChange({ medicineName: e.target.value })}
              placeholder="Ex. Amoxicilline 1 g"
              className="rx-field"
              autoComplete="off"
            />
          </Field>
          <Field label="Dosage / concentration">
            <input
              value={item.dosage}
              onChange={(e) => onChange({ dosage: e.target.value })}
              placeholder="Ex. 1 g"
              className="rx-field"
            />
          </Field>
          <Field label="Forme">
            <input
              value={item.form}
              onChange={(e) => onChange({ form: e.target.value })}
              placeholder="Comprimé, sirop…"
              className="rx-field"
              list="rx-forms"
            />
          </Field>
          <Field label="Posologie">
            <input
              value={item.posology}
              onChange={(e) => onChange({ posology: e.target.value })}
              placeholder="1 comprimé toutes les 8 h"
              className="rx-field"
            />
          </Field>
          <Field label="Fréquence">
            <input
              value={item.frequency}
              onChange={(e) => onChange({ frequency: e.target.value })}
              placeholder="Matin, midi et soir"
              className="rx-field"
            />
          </Field>
          <Field label="Durée">
            <input
              value={item.duration}
              onChange={(e) => onChange({ duration: e.target.value })}
              placeholder="7 jours"
              className="rx-field"
            />
          </Field>
          <Field label="Quantité">
            <input
              value={item.quantity}
              onChange={(e) => onChange({ quantity: e.target.value })}
              placeholder="21 comprimés"
              className="rx-field"
            />
          </Field>
          <Field label="Voie d'administration">
            <input
              value={item.route}
              onChange={(e) => onChange({ route: e.target.value })}
              placeholder="Orale"
              className="rx-field"
              list="rx-routes"
            />
          </Field>
          <Field label="Instructions particulières" className="sm:col-span-2">
            <input
              value={item.instructions}
              onChange={(e) => onChange({ instructions: e.target.value })}
              placeholder="À prendre pendant les repas, ne pas écraser…"
              className="rx-field"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

export function PrescriptionEditor({
  me,
  rx,
  initialPatient,
}: {
  me: DoctorProfile;
  rx?: EditorRx | null;
  initialPatient?: PatientSearchResult | null;
}) {
  const router = useRouter();
  const [patient, setPatient] = useState<PatientSearchResult | null>(() => {
    if (initialPatient) return initialPatient;
    if (!rx) return null;
    return {
      id: rx.patient_id,
      fullName: rx.patient_name,
      email: rx.patient_email,
      phone: rx.patient_phone,
      birthDate: rx.patient_birth_date ? rx.patient_birth_date.slice(0, 10) : null,
      sex: rx.patient_sex,
      address: null,
      sahaCode: patientCode(rx.patient_id),
      lastVisit: null,
      prescriptions: 0,
    };
  });
  const [consultationDate, setConsultationDate] = useState(
    rx?.consultation_date?.slice(0, 10) || todayKey(),
  );
  const [diagnosis, setDiagnosis] = useState(rx?.diagnosis ?? "");
  const [reason, setReason] = useState(rx?.reason ?? "");
  const [observations, setObservations] = useState(rx?.observations ?? "");
  const [advice, setAdvice] = useState(rx?.advice ?? "");
  const [identityVerified, setIdentityVerified] = useState(rx?.identity_verified ?? false);
  const [items, setItems] = useState<EditorItem[]>(() => {
    if (rx && rx.items.length > 0) {
      return rx.items.map((i) => ({
        key: uid(),
        medicineName: i.medicine_name,
        dosage: i.dosage ?? "",
        form: i.form ?? "",
        quantity: i.quantity ?? "",
        posology: i.posology ?? "",
        frequency: i.frequency ?? "",
        duration: i.duration ?? "",
        route: i.route ?? "",
        instructions: i.instructions ?? "",
      }));
    }
    return [emptyItem()];
  });
  const [saving, setSaving] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [sendAfter, setSendAfter] = useState(false);
  const [signing, setSigning] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const readOnly = !!rx && rx.status !== "draft";

  useEffect(() => {
    if (!templateOpen || templates !== null) return;
    setLoadingTemplates(true);
    listDoctorTemplates()
      .then((rows) => setTemplates(rows as Template[]))
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));
  }, [templateOpen, templates]);

  const filledItems = useMemo(
    () => items.filter((i) => i.medicineName.trim().length > 0),
    [items],
  );

  const documentProps = {
    number: rx?.number ?? "ORD-APERÇU",
    version: rx?.version ?? 1,
    status: rx?.status ?? "draft",
    doctorName: doctorDisplay(rx?.doctor_name || me.full_name),
    doctorSpecialty: rx?.doctor_specialty || me.specialty_label,
    doctorLicense: rx?.doctor_license || me.license_number,
    establishmentName:
      rx?.establishment_name ||
      me.establishment_name ||
      (me.city ? `Cabinet médical — ${me.city}` : "Cabinet médical SAHA"),
    establishmentAddress:
      rx?.establishment_address || me.establishment_address || me.address || null,
    establishmentPhone: rx?.establishment_phone || me.establishment_phone || me.phone || null,
    patientName: patient?.fullName ?? "Patient à sélectionner",
    patientBirthDate: patient?.birthDate ?? null,
    patientSex: patient?.sex ?? null,
    patientPhone: patient?.phone ?? null,
    patientCode: patient?.sahaCode ?? "SAHA-••••••••",
    consultationDate,
    diagnosis,
    reason,
    observations,
    advice,
    identityVerified,
    signedAt: rx?.signed_at ?? null,
    signatureHash: rx?.signature_hash ?? null,
    items: items.map((i) => ({
      medicine_name: i.medicineName,
      dosage: i.dosage,
      form: i.form,
      quantity: i.quantity,
      posology: i.posology,
      frequency: i.frequency,
      duration: i.duration,
      route: i.route,
      instructions: i.instructions,
    })),
    verifyUrl: null,
    qrSrc: null,
  };

  const validate = () => {
    if (!patient) {
      toast.error("Sélectionnez d'abord le patient.");
      return false;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(consultationDate)) {
      toast.error("Renseignez la date de consultation.");
      return false;
    }
    if (filledItems.length === 0) {
      toast.error("Ajoutez au moins un médicament.");
      return false;
    }
    if (!identityVerified) {
      toast.error("Confirmez l'identité du patient avant de signer.");
      return false;
    }
    return true;
  };

  const persist = async (): Promise<string | null> => {
    if (!patient) return null;
    setSaving(true);
    try {
      const res = await saveDoctorPrescription({
        data: {
          id: rx?.id,
          patientId: patient.id,
          consultationDate,
          diagnosis,
          reason,
          observations,
          advice,
          identityVerified,
          items: filledItems.map((i) => ({
            medicineName: i.medicineName,
            dosage: i.dosage,
            form: i.form,
            quantity: i.quantity,
            posology: i.posology,
            frequency: i.frequency,
            duration: i.duration,
            route: i.route,
            instructions: i.instructions,
          })),
        },
      });
      return res.id;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    if (!patient) {
      toast.error("Sélectionnez d'abord le patient.");
      return;
    }
    if (filledItems.length === 0) {
      toast.error("Ajoutez au moins un médicament.");
      return;
    }
    const id = await persist();
    if (!id) return;
    toast.success("Brouillon enregistré.");
    router.navigate({ to: "/medecin/app/ordonnances/$id", params: { id } });
  };

  const startSign = () => {
    if (!validate()) return;
    setPassword("");
    setSignOpen(true);
  };

  const confirmSign = async () => {
    if (!password.trim()) {
      toast.error("Saisissez votre mot de passe pour signer.");
      return;
    }
    setSigning(true);
    try {
      const id = await persist();
      if (!id) return;
      const res = await signDoctorPrescription({ data: { id, password } });
      if (sendAfter) {
        await sendDoctorPrescription({ data: { id } });
        toast.success("Ordonnance signée et envoyée au patient.");
      } else {
        toast.success("Ordonnance signée électroniquement.");
      }
      setSignOpen(false);
      router.navigate({ to: "/medecin/app/ordonnances/$id", params: { id } });
      void res;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Signature impossible");
    } finally {
      setSigning(false);
    }
  };

  const applyTemplate = (t: Template) => {
    setDiagnosis(t.diagnosis ?? "");
    setAdvice(t.advice ?? "");
    const raw = Array.isArray(t.items) ? (t.items as Array<Record<string, string>>) : [];
    if (raw.length > 0) {
      setItems(
        raw.map((i) => ({
          key: uid(),
          medicineName: i.medicineName ?? i.medicine_name ?? "",
          dosage: i.dosage ?? "",
          form: i.form ?? "",
          quantity: i.quantity ?? "",
          posology: i.posology ?? "",
          frequency: i.frequency ?? "",
          duration: i.duration ?? "",
          route: i.route ?? "",
          instructions: i.instructions ?? "",
        })),
      );
    }
    setTemplateOpen(false);
    toast.success(`Modèle « ${t.name} » chargé.`);
  };

  return (
    <div className="pb-24 lg:pb-0">
      <datalist id="rx-forms">
        {FORMS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <datalist id="rx-routes">
        {ROUTES.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      {/* En-tête */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.history.back()}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.14] bg-white/[0.06] text-[#d9f2ea] transition hover:bg-white/[0.12]"
            aria-label="Retour"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2ee0aa]">
              Espace médecin
            </p>
            <h1 className="font-display text-2xl leading-tight text-white sm:text-3xl">
              {readOnly ? "Ordonnance signée" : rx ? "Modifier l'ordonnance" : "Nouvelle ordonnance"}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTemplateOpen(true)}
            className="rx-btn-ghost px-3.5 py-2 text-xs"
            disabled={readOnly}
          >
            <BookMarked className="h-4 w-4" />
            <span className="hidden sm:inline">Charger un modèle</span>
            <span className="sm:hidden">Modèle</span>
          </button>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="rx-btn-ghost px-3.5 py-2 text-xs xl:hidden"
          >
            <Eye className="h-4 w-4" />
            Aperçu
          </button>
        </div>
      </div>

      {readOnly && (
        <div className="mb-4 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-xs text-amber-200">
          Cette ordonnance est signée : elle ne peut plus être modifiée. Utilisez « Créer un
          avenant » depuis le document pour toute correction.
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_480px]">
        {/* Formulaire */}
        <div className="space-y-4">
          <section className="rx-card rounded-[24px] p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[#072b26]">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                Informations du patient
              </h2>
              <span className="text-[10px] font-semibold text-[#7a978f]">
                {patient ? "Sélectionné" : "Obligatoire"}
              </span>
            </div>
            <PatientPicker
              value={patient}
              onSelect={(p) => {
                setPatient(p);
                setIdentityVerified(false);
              }}
              onClear={() => {
                setPatient(null);
                setIdentityVerified(false);
              }}
            />

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-[#e4efeb] bg-[#f8fcfa] px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#7a978f]">
                  Date de consultation
                </p>
                <input
                  type="date"
                  value={consultationDate}
                  onChange={(e) => setConsultationDate(e.target.value)}
                  className="mt-0.5 w-full border-0 bg-transparent p-0 text-sm font-semibold text-[#072b26] outline-none"
                  disabled={readOnly}
                />
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[#e4efeb] bg-[#f8fcfa] px-3 py-2">
                <input
                  type="checkbox"
                  checked={identityVerified}
                  onChange={(e) => setIdentityVerified(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#047857]"
                  disabled={readOnly}
                />
                <span>
                  <span className="block text-[11px] font-bold text-[#072b26]">
                    Identité du patient vérifiée
                  </span>
                  <span className="block text-[10px] leading-snug text-[#6d8a82]">
                    Pièce d'identité ou date de naissance confirmée en consultation.
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section className="rx-card rounded-[24px] p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#072b26]">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
                <FileCheck2 className="h-3.5 w-3.5" />
              </span>
              Diagnostic et motif
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Diagnostic">
                <input
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="Ex. Infection ORL"
                  className="rx-field"
                  disabled={readOnly}
                />
              </Field>
              <Field label="Motif de consultation">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex. Fièvre et toux depuis 3 jours"
                  className="rx-field"
                  disabled={readOnly}
                />
              </Field>
            </div>
          </section>

          <section className="rx-card rounded-[24px] p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[#072b26]">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
                  <Plus className="h-3.5 w-3.5" />
                </span>
                Médicaments prescrits
              </h2>
              <span className="rx-chip bg-[#e2f7ee] text-[#047857]">
                {filledItems.length} médicament{filledItems.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="space-y-2.5">
              {items.map((item, index) => (
                <ItemEditor
                  key={item.key}
                  item={item}
                  index={index}
                  canRemove={items.length > 1 && !readOnly}
                  onChange={(patch) =>
                    setItems((prev) =>
                      prev.map((it) => (it.key === item.key ? { ...it, ...patch } : it)),
                    )
                  }
                  onRemove={() => setItems((prev) => prev.filter((it) => it.key !== item.key))}
                />
              ))}
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, emptyItem()])}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#bfe6d8] bg-[#f4fbf8] px-4 py-3 text-xs font-bold text-[#047857] transition hover:border-[#00a97c] hover:bg-[#eaf8f2]"
              >
                <Plus className="h-4 w-4" />
                Ajouter un médicament
              </button>
            )}
          </section>

          <section className="rx-card rounded-[24px] p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#072b26]">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
              Conseils et observations
            </h2>
            <div className="grid gap-3">
              <Field label="Conseils au patient">
                <textarea
                  value={advice}
                  onChange={(e) => setAdvice(e.target.value)}
                  rows={3}
                  placeholder="Boire beaucoup d'eau, se reposer, revenir en cas de fièvre persistante…"
                  className="rx-field resize-y"
                  disabled={readOnly}
                />
              </Field>
              <Field label="Observations médicales">
                <textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  rows={3}
                  placeholder="Antécédents, allergies, tension, température…"
                  className="rx-field resize-y"
                  disabled={readOnly}
                />
              </Field>
            </div>
          </section>

          {!readOnly && (
            <div className="hidden flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/[0.12] bg-white/[0.04] p-3 sm:flex">
              <button
                type="button"
                onClick={saveDraft}
                disabled={saving}
                className="rx-btn-ghost px-4 py-2.5 text-sm"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Enregistrer le brouillon
              </button>
              <button
                type="button"
                onClick={startSign}
                disabled={saving}
                className="rx-btn-primary px-5 py-2.5 text-sm"
              >
                <LockKeyhole className="h-4 w-4" />
                Signer et enregistrer
              </button>
            </div>
          )}
        </div>

        {/* Aperçu desktop */}
        <div className="hidden xl:block">
          <div className="sticky top-6">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9fc4b9]">
                Aperçu du document
              </span>
              <span className="rx-chip border border-white/10 bg-white/[0.06] text-[#c9e5dd]">
                Temps réel
              </span>
            </div>
            <div className="max-h-[calc(100dvh-130px)] overflow-y-auto rounded-[28px] rx-scroll">
              <RxDocument {...documentProps} compact />
            </div>
          </div>
        </div>
      </div>

      {/* Barre d'action mobile */}
      {!readOnly && (
        <div className="fixed inset-x-0 bottom-[76px] z-40 border-t border-white/10 bg-[#041e1a]/92 px-3 py-2.5 backdrop-blur-xl lg:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-2">
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving}
              className="rx-btn-ghost h-11 flex-1 px-3 text-xs"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Brouillon
            </button>
            <button
              type="button"
              onClick={startSign}
              disabled={saving}
              className="rx-btn-primary h-11 flex-[1.6] px-4 text-xs"
            >
              <LockKeyhole className="h-4 w-4" />
              Signer et enregistrer
            </button>
          </div>
        </div>
      )}

      {/* Aperçu plein écran (mobile/tablette) */}
      {previewOpen && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#031713]/95 p-3 backdrop-blur-xl">
          <div className="mx-auto max-w-3xl">
            <div className="sticky top-0 z-10 mb-3 flex items-center justify-between rounded-2xl border border-white/10 bg-[#06251f]/95 px-3 py-2 backdrop-blur-xl">
              <span className="text-xs font-bold text-white">Aperçu de l'ordonnance</span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white"
                aria-label="Fermer l'aperçu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <RxDocument {...documentProps} />
          </div>
        </div>
      )}

      {/* Signature */}
      <Dialog open={signOpen} onOpenChange={(v) => !signing && setSignOpen(v)}>
        <DialogContent className="max-w-md border-0 bg-transparent p-0 shadow-none">
          <div className="rx-paper rounded-[26px] p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display text-2xl text-[#072b26]">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e2f7ee] text-[#047857]">
                  <LockKeyhole className="h-4 w-4" />
                </span>
                Signature électronique
              </DialogTitle>
              <DialogDescription className="text-left text-xs leading-relaxed text-[#5f7f76]">
                Authentifiez-vous pour sceller l'ordonnance de{" "}
                <strong className="text-[#072b26]">{patient?.fullName}</strong>. La signature
                engage votre responsabilité médicale et fige le document.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 rounded-xl border border-[#e4efeb] bg-[#f7fbf9] p-3 text-[11px] text-[#4f6f67]">
              <div className="flex items-center justify-between">
                <span>Médicaments</span>
                <span className="font-bold text-[#072b26]">{filledItems.length}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Date de consultation</span>
                <span className="font-bold text-[#072b26]">{formatDateFr(consultationDate)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Identité patient</span>
                <span className="font-bold text-[#047857]">Vérifiée</span>
              </div>
            </div>

            <label className="mt-4 block">
              <span className="rx-label">Mot de passe du compte</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void confirmSign();
                }}
                placeholder="Votre mot de passe"
                className="rx-field"
                autoFocus
              />
            </label>

            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-[#e4efeb] px-3 py-2">
              <input
                type="checkbox"
                checked={sendAfter}
                onChange={(e) => setSendAfter(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#047857]"
              />
              <span className="text-[11px] leading-snug text-[#4f6f67]">
                <span className="block font-bold text-[#072b26]">
                  Envoyer immédiatement au patient
                </span>
                L'ordonnance apparaîtra dans son espace SAHA avec une notification.
              </span>
            </label>

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSignOpen(false)}
                disabled={signing}
                className="flex-1 rounded-full border-[#d7e7e1] text-[#4f6f67]"
              >
                Annuler
              </Button>
              <button
                type="button"
                onClick={confirmSign}
                disabled={signing}
                className="rx-btn-primary flex-[1.5] px-4 py-2.5 text-sm"
              >
                {signing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : sendAfter ? (
                  <Send className="h-4 w-4" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {signing ? "Signature…" : sendAfter ? "Signer et envoyer" : "Signer l'ordonnance"}
              </button>
            </div>
            <p className="mt-3 text-center text-[9px] leading-relaxed text-[#8aa39c]">
              Une empreinte HMAC-SHA256 et un QR code de vérification seront générés. Toute
              modification ultérieure créera un avenant audité.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modèles */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-lg border-0 bg-transparent p-0 shadow-none">
          <div className="rx-paper rounded-[26px] p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display text-2xl text-[#072b26]">
                <BookMarked className="h-5 w-5 text-[#047857]" />
                Modèles d'ordonnance
              </DialogTitle>
              <DialogDescription className="text-left text-xs text-[#5f7f76]">
                Chargez un modèle pour préremplir le diagnostic, les conseils et les médicaments.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto rx-scroll">
              {loadingTemplates && (
                <div className="flex items-center justify-center py-8 text-[#5f7f76]">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              {!loadingTemplates && templates?.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[#d7e7e1] px-4 py-6 text-center text-xs text-[#5f7f76]">
                  Aucun modèle enregistré. Créez-en depuis la page « Modèles ».
                </div>
              )}
              {templates?.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#e4efeb] bg-[#f9fcfb] px-4 py-3 text-left transition hover:border-[#bfe6d8] hover:bg-[#f1faf6]"
                >
                  <span>
                    <span className="block text-sm font-bold text-[#072b26]">{t.name}</span>
                    <span className="mt-0.5 block text-[11px] text-[#6d8a82]">
                      {t.diagnosis || "Sans diagnostic"} ·{" "}
                      {Array.isArray(t.items) ? t.items.length : 0} médicament(s)
                    </span>
                  </span>
                  <span className="rx-chip bg-[#e2f7ee] text-[#047857]">Charger</span>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
