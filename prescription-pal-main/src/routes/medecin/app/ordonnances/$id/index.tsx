import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  Ban,
  CalendarDays,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileSignature,
  History,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Printer,
  Send,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  amendDoctorPrescription,
  cancelDoctorPrescription,
  getDoctorPrescription,
  getDoctorPrescriptionPdf,
  recordDoctorPrescriptionEvent,
  sendDoctorPrescription,
  signDoctorPrescription,
} from "@/lib/doctor-rx.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RxDocument } from "@/components/doctor-rx/RxDocument";
import {
  RxStatusBadge,
  ageFromBirth,
  formatDateFr,
  formatDateTimeFr,
  sexLabel,
} from "@/components/doctor-rx/rx-ui";

export const Route = createFileRoute("/medecin/app/ordonnances/$id/")({
  component: PrescriptionDetail,
});

type Detail = Awaited<ReturnType<typeof getDoctorPrescription>>;

const EVENT_ICONS: Record<string, React.ReactNode> = {
  created: <FileSignature className="h-3.5 w-3.5" />,
  updated: <Pencil className="h-3.5 w-3.5" />,
  identity_verified: <UserRound className="h-3.5 w-3.5" />,
  signed: <LockKeyhole className="h-3.5 w-3.5" />,
  sent: <Send className="h-3.5 w-3.5" />,
  downloaded: <Download className="h-3.5 w-3.5" />,
  printed: <Printer className="h-3.5 w-3.5" />,
  cancelled: <Ban className="h-3.5 w-3.5" />,
  amended: <History className="h-3.5 w-3.5" />,
  pdf_generated: <FileSignature className="h-3.5 w-3.5" />,
};

function PrescriptionDetail() {
  const { id } = Route.useParams();
  const router = useRouter();
  const [rx, setRx] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [signing, setSigning] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [amending, setAmending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getDoctorPrescription({ data: { id } });
      setRx(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadPdf = async () => {
    if (!rx) return;
    setLoadingPdf(true);
    try {
      const { url } = await getDoctorPrescriptionPdf({ data: { id: rx.id } });
      const response = await fetch(url);
      if (!response.ok) throw new Error("Téléchargement impossible");
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `ordonnance-${rx.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 3000);
      void recordDoctorPrescriptionEvent({ data: { id: rx.id, action: "downloaded" } }).catch(
        () => {},
      );
      toast.success("PDF téléchargé.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Téléchargement impossible");
    } finally {
      setLoadingPdf(false);
    }
  };

  const print = () => {
    if (!rx) return;
    void recordDoctorPrescriptionEvent({ data: { id: rx.id, action: "printed" } }).catch(() => {});
    window.print();
  };

  const confirmSign = async () => {
    if (!rx) return;
    if (!password.trim()) {
      toast.error("Saisissez votre mot de passe.");
      return;
    }
    setSigning(true);
    try {
      await signDoctorPrescription({ data: { id: rx.id, password } });
      toast.success("Ordonnance signée électroniquement.");
      setSignOpen(false);
      setPassword("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Signature impossible");
    } finally {
      setSigning(false);
    }
  };

  const confirmSend = async () => {
    if (!rx) return;
    setSending(true);
    try {
      await sendDoctorPrescription({ data: { id: rx.id } });
      toast.success("Ordonnance transmise à l'espace patient.");
      setSendOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setSending(false);
    }
  };

  const confirmCancel = async () => {
    if (!rx) return;
    setCancelling(true);
    try {
      await cancelDoctorPrescription({ data: { id: rx.id, reason: cancelReason } });
      toast.success("Ordonnance annulée.");
      setCancelOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Annulation impossible");
    } finally {
      setCancelling(false);
    }
  };

  const confirmAmend = async () => {
    if (!rx) return;
    setAmending(true);
    try {
      const { id: draftId } = await amendDoctorPrescription({ data: { id: rx.id } });
      toast.success("Avenant créé. Complétez puis signez la nouvelle version.");
      router.navigate({
        to: "/medecin/app/ordonnances/$id/modifier",
        params: { id: draftId },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Création de l'avenant impossible");
    } finally {
      setAmending(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-rose-300/25 bg-rose-400/10 p-6 text-sm text-rose-200">
        {error}
      </div>
    );
  }

  if (!rx) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[#9fc4b9]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const isDraft = rx.status === "draft";
  const isSigned = rx.status === "signed";
  const isFinal = rx.status === "sent" || rx.status === "viewed";
  const isClosed = rx.status === "cancelled" || rx.status === "amended";
  const canAmend = isSigned || isFinal;

  return (
    <div className="mx-auto max-w-7xl">
      {/* En-tête */}
      <div className="rx-no-print mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => router.history.back()}
            className="mt-0.5 grid h-10 w-10 place-items-center rounded-full border border-white/[0.14] bg-white/[0.06] text-[#d9f2ea] transition hover:bg-white/[0.12]"
            aria-label="Retour"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2ee0aa]">
              Ordonnance électronique
            </p>
            <h1 className="font-display text-2xl leading-tight text-white sm:text-3xl">
              {rx.number}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <RxStatusBadge status={rx.status} dark />
              <span className="text-[10px] text-[#8fb8ac]">Version {rx.version}</span>
              {rx.identity_verified && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#5ff0c4]">
                  <ShieldCheck className="h-3 w-3" />
                  Identité vérifiée
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isDraft && (
            <>
              <Link
                to="/medecin/app/ordonnances/$id/modifier"
                params={{ id: rx.id }}
                className="rx-btn-ghost px-4 py-2 text-xs"
              >
                <Pencil className="h-4 w-4" />
                Modifier
              </Link>
              <button
                type="button"
                onClick={() => {
                  setPassword("");
                  setSignOpen(true);
                }}
                className="rx-btn-primary px-4 py-2 text-xs"
              >
                <LockKeyhole className="h-4 w-4" />
                Signer
              </button>
            </>
          )}
          {isSigned && (
            <button
              type="button"
              onClick={() => setSendOpen(true)}
              className="rx-btn-primary px-4 py-2 text-xs"
            >
              <Send className="h-4 w-4" />
              Envoyer au patient
            </button>
          )}
          <button
            type="button"
            onClick={downloadPdf}
            disabled={loadingPdf}
            className="rx-btn-ghost px-4 py-2 text-xs"
          >
            {loadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            PDF
          </button>
          <button type="button" onClick={print} className="rx-btn-ghost px-4 py-2 text-xs">
            <Printer className="h-4 w-4" />
            Imprimer
          </button>
        </div>
      </div>

      {isClosed && (
        <div className="rx-no-print mb-4 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-xs text-amber-200">
          {rx.status === "cancelled"
            ? "Cette ordonnance a été annulée. Elle reste archivée pour l'audit et n'est plus valide."
            : "Cette ordonnance a été remplacée par un avenant. Consultez la version la plus récente pour la prescription en vigueur."}
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Document */}
        <div className="rx-print-area">
          <RxDocument
            number={rx.number}
            version={rx.version}
            status={rx.status}
            doctorName={rx.doctor_name}
            doctorSpecialty={rx.doctor_specialty}
            doctorLicense={rx.doctor_license}
            establishmentName={rx.establishment_name}
            establishmentAddress={rx.establishment_address}
            establishmentPhone={rx.establishment_phone}
            patientName={rx.patient_name}
            patientBirthDate={rx.patient_birth_date}
            patientSex={rx.patient_sex}
            patientPhone={rx.patientPhone}
            patientCode={rx.patientCode}
            consultationDate={rx.consultation_date}
            diagnosis={rx.diagnosis}
            reason={rx.reason}
            observations={rx.observations}
            advice={rx.advice}
            identityVerified={rx.identity_verified}
            signedAt={rx.signed_at}
            signatureHash={rx.signature_hash}
            items={rx.items}
            verifyUrl={rx.verifyUrl}
            qrSrc={rx.qrSrc}
          />
        </div>

        {/* Panneau latéral */}
        <div className="rx-no-print space-y-3">
          {isDraft && (
            <section className="rx-card rounded-[24px] p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[#072b26]">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-amber-100 text-amber-700">
                  <LockKeyhole className="h-3.5 w-3.5" />
                </span>
                Finaliser l'ordonnance
              </h2>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[#5f7f76]">
                Vérifiez le contenu puis apposez votre signature. Le document sera figé et un QR
                code de vérification sera généré.
              </p>
              <button
                type="button"
                onClick={() => {
                  setPassword("");
                  setSignOpen(true);
                }}
                className="rx-btn-primary mt-3 w-full px-4 py-2.5 text-xs"
              >
                <LockKeyhole className="h-4 w-4" />
                Signer électroniquement
              </button>
              <Link
                to="/medecin/app/ordonnances/$id/modifier"
                params={{ id: rx.id }}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-[#d7e7e1] px-4 py-2 text-xs font-semibold text-[#4f6f67] transition hover:bg-[#f4faf7]"
              >
                <Pencil className="h-3.5 w-3.5" />
                Modifier le brouillon
              </Link>
            </section>
          )}

          {isSigned && (
            <section className="rx-card rounded-[24px] p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[#072b26]">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                  <Send className="h-3.5 w-3.5" />
                </span>
                Transmettre au patient
              </h2>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[#5f7f76]">
                L'ordonnance apparaîtra dans l'espace SAHA du patient avec une notification. Le
                PDF signé sera archivé.
              </p>
              <button
                type="button"
                onClick={() => setSendOpen(true)}
                className="rx-btn-primary mt-3 w-full px-4 py-2.5 text-xs"
              >
                <Send className="h-4 w-4" />
                Envoyer au patient
              </button>
            </section>
          )}

          {isFinal && (
            <section className="rounded-[24px] border border-emerald-300/25 bg-emerald-400/10 p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-200">
                <CheckCircle2 className="h-4 w-4" />
                Transmise au patient
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-emerald-100/80">
                Envoyée le {formatDateTimeFr(rx.sent_at)}. Le patient peut consulter le PDF et
                choisir une pharmacie.
              </p>
            </section>
          )}

          <section className="rx-card rounded-[24px] p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-[#072b26]">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
                <UserRound className="h-3.5 w-3.5" />
              </span>
              Patient
            </h2>
            <p className="text-[13px] font-bold text-[#072b26]">{rx.patient_name}</p>
            <p className="mt-0.5 font-mono text-[10px] text-[#047857]">{rx.patientCode}</p>
            <div className="mt-2 space-y-1 text-[11px] text-[#4f6f67]">
              <p>
                {ageFromBirth(rx.patient_birth_date) ?? "—"} ans · {sexLabel(rx.patient_sex)}
              </p>
              {rx.patientPhone && (
                <p className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3 text-[#7a978f]" />
                  {rx.patientPhone}
                </p>
              )}
              {rx.patientEmail && (
                <p className="flex min-w-0 items-center gap-1.5">
                  <Mail className="h-3 w-3 shrink-0 text-[#7a978f]" />
                  <span className="truncate">{rx.patientEmail}</span>
                </p>
              )}
            </div>
            <Link
              to="/medecin/app/patients"
              search={{ patientId: rx.patient_id }}
              className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-[#047857]"
            >
              Voir le dossier patient
              <ExternalLink className="h-3 w-3" />
            </Link>
          </section>

          <section className="rx-card rounded-[24px] p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-[#072b26]">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
                <Stethoscope className="h-3.5 w-3.5" />
              </span>
              Médecin & établissement
            </h2>
            <p className="text-[12px] font-bold text-[#072b26]">Dr. {rx.doctor_name.replace(/^dr\.?\s+/i, "")}</p>
            <p className="text-[10px] font-semibold text-[#047857]">{rx.doctor_specialty || "Médecin"}</p>
            {rx.doctor_license && (
              <p className="mt-0.5 text-[10px] text-[#6d8a82]">N° {rx.doctor_license}</p>
            )}
            <p className="mt-2 text-[11px] font-semibold text-[#072b26]">{rx.establishment_name}</p>
            {rx.establishment_address && (
              <p className="mt-0.5 flex items-start gap-1.5 text-[10px] text-[#6d8a82]">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                {rx.establishment_address}
              </p>
            )}
            {rx.establishment_phone && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#6d8a82]">
                <Phone className="h-3 w-3 shrink-0" />
                {rx.establishment_phone}
              </p>
            )}
          </section>

          <section className="rx-card rounded-[24px] p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-[#072b26]">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
                <CalendarDays className="h-3.5 w-3.5" />
              </span>
              Dates & signature
            </h2>
            <dl className="space-y-1.5 text-[10px]">
              <div className="flex justify-between gap-2">
                <dt className="text-[#7a978f]">Consultation</dt>
                <dd className="font-semibold text-[#072b26]">{formatDateFr(rx.consultation_date)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#7a978f]">Créée le</dt>
                <dd className="font-semibold text-[#072b26]">{formatDateTimeFr(rx.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#7a978f]">Signée le</dt>
                <dd className="font-semibold text-[#072b26]">{formatDateTimeFr(rx.signed_at)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#7a978f]">Envoyée le</dt>
                <dd className="font-semibold text-[#072b26]">{formatDateTimeFr(rx.sent_at)}</dd>
              </div>
            </dl>
            {rx.signature_hash && (
              <div className="mt-2 rounded-xl bg-[#f4faf7] p-2">
                <p className="text-[8px] font-bold uppercase tracking-widest text-[#7a978f]">
                  Empreinte de signature
                </p>
                <p className="mt-0.5 break-all font-mono text-[8px] leading-relaxed text-[#047857]">
                  {rx.signature_hash}
                </p>
              </div>
            )}
            {rx.pdf_sha256 && (
              <div className="mt-1.5 rounded-xl bg-[#f4faf7] p-2">
                <p className="text-[8px] font-bold uppercase tracking-widest text-[#7a978f]">
                  SHA-256 du PDF
                </p>
                <p className="mt-0.5 break-all font-mono text-[8px] leading-relaxed text-[#5f7f76]">
                  {rx.pdf_sha256}
                </p>
              </div>
            )}
            {rx.verifyUrl && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(rx.verifyUrl);
                    toast.success("Lien de vérification copié.");
                  } catch {
                    toast.error("Copie impossible");
                  }
                }}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-[#d7e7e1] px-3 py-1.5 text-[10px] font-semibold text-[#4f6f67] transition hover:bg-[#f4faf7]"
              >
                <Copy className="h-3 w-3" />
                Copier le lien de vérification
              </button>
            )}
          </section>

          {canAmend && (
            <section className="rounded-[24px] border border-[#d7e7e1] bg-[#f4faf7] p-4">
              <p className="flex items-center gap-2 text-[12px] font-bold text-[#072b26]">
                <History className="h-4 w-4 text-[#047857]" />
                Correction / avenant
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-[#5f7f76]">
                Une ordonnance signée ne se modifie pas. Créez une nouvelle version qui conservera
                la trace de l'originale.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAmendOpen(true)}
                  className="flex-1 rounded-full border border-[#bfe6d8] bg-white px-3 py-2 text-[10px] font-bold text-[#047857] transition hover:bg-[#eaf8f2]"
                >
                  Créer un avenant
                </button>
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  className="rounded-full border border-rose-200 bg-white px-3 py-2 text-[10px] font-bold text-rose-600 transition hover:bg-rose-50"
                >
                  Annuler
                </button>
              </div>
            </section>
          )}

          {rx.events.length > 0 && (
            <section className="rx-card rounded-[24px] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#072b26]">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
                  <History className="h-3.5 w-3.5" />
                </span>
                Journal d'audit
              </h2>
              <div className="space-y-2.5">
                {rx.events.slice(0, 12).map((ev) => (
                  <div key={ev.id} className="flex gap-2.5">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#eef8f4] text-[#047857]">
                      {EVENT_ICONS[ev.action] ?? <History className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold leading-snug text-[#072b26]">
                        {rx.eventLabels[ev.action] ?? ev.action}
                      </p>
                      <p className="text-[9px] text-[#8aa39c]">{formatDateTimeFr(ev.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Dialog signature */}
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
                Confirmez votre identité pour sceller l'ordonnance de{" "}
                <strong className="text-[#072b26]">{rx.patient_name}</strong>.
              </DialogDescription>
            </DialogHeader>
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
            <div className="mt-4 flex gap-2">
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
                {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {signing ? "Signature…" : "Signer l'ordonnance"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog envoi */}
      <Dialog open={sendOpen} onOpenChange={(v) => !sending && setSendOpen(v)}>
        <DialogContent className="max-w-md border-0 bg-transparent p-0 shadow-none">
          <div className="rx-paper rounded-[26px] p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display text-2xl text-[#072b26]">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Send className="h-4 w-4" />
                </span>
                Envoyer au patient
              </DialogTitle>
              <DialogDescription className="text-left text-xs leading-relaxed text-[#5f7f76]">
                L'ordonnance signée sera transmise à <strong className="text-[#072b26]">{rx.patient_name}</strong>{" "}
                et apparaîtra dans son espace SAHA avec une notification.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 rounded-xl border border-[#e4efeb] bg-[#f7fbf9] p-3 text-[11px] text-[#4f6f67]">
              <div className="flex justify-between">
                <span>Document</span>
                <span className="font-mono font-bold text-[#072b26]">{rx.number}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span>Médicaments</span>
                <span className="font-bold text-[#072b26]">{rx.items.length}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span>Signature</span>
                <span className="font-bold text-[#047857]">Vérifiée</span>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSendOpen(false)}
                disabled={sending}
                className="flex-1 rounded-full border-[#d7e7e1] text-[#4f6f67]"
              >
                Annuler
              </Button>
              <button
                type="button"
                onClick={confirmSend}
                disabled={sending}
                className="rx-btn-primary flex-[1.5] px-4 py-2.5 text-sm"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? "Envoi…" : "Confirmer l'envoi"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog annulation */}
      <Dialog open={cancelOpen} onOpenChange={(v) => !cancelling && setCancelOpen(v)}>
        <DialogContent className="max-w-md border-0 bg-transparent p-0 shadow-none">
          <div className="rx-paper rounded-[26px] p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display text-2xl text-[#072b26]">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-100 text-rose-600">
                  <Ban className="h-4 w-4" />
                </span>
                Annuler l'ordonnance
              </DialogTitle>
              <DialogDescription className="text-left text-xs leading-relaxed text-[#5f7f76]">
                L'ordonnance restera archivée mais ne sera plus valide. Le patient recevra une
                notification si le document lui a déjà été transmis.
              </DialogDescription>
            </DialogHeader>
            <label className="mt-4 block">
              <span className="rx-label">Motif (optionnel)</span>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                placeholder="Erreur de posologie, doublon…"
                className="rx-field resize-y"
              />
            </label>
            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCancelOpen(false)}
                disabled={cancelling}
                className="flex-1 rounded-full border-[#d7e7e1] text-[#4f6f67]"
              >
                Retour
              </Button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={cancelling}
                className="inline-flex flex-[1.5] items-center justify-center gap-2 rounded-full bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                {cancelling ? "Annulation…" : "Confirmer l'annulation"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog avenant */}
      <Dialog open={amendOpen} onOpenChange={(v) => !amending && setAmendOpen(v)}>
        <DialogContent className="max-w-md border-0 bg-transparent p-0 shadow-none">
          <div className="rx-paper rounded-[26px] p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display text-2xl text-[#072b26]">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e2f7ee] text-[#047857]">
                  <History className="h-4 w-4" />
                </span>
                Créer un avenant
              </DialogTitle>
              <DialogDescription className="text-left text-xs leading-relaxed text-[#5f7f76]">
                Une nouvelle version brouillon (v{rx.version + 1}) sera créée avec le même contenu.
                L'originale sera marquée « Avenant » et restera consultable dans l'audit.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAmendOpen(false)}
                disabled={amending}
                className="flex-1 rounded-full border-[#d7e7e1] text-[#4f6f67]"
              >
                Annuler
              </Button>
              <button
                type="button"
                onClick={confirmAmend}
                disabled={amending}
                className="rx-btn-primary flex-[1.5] px-4 py-2.5 text-sm"
              >
                {amending ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                {amending ? "Création…" : "Créer la version"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
