import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Building2,
  CalendarDays,
  CheckCircle2,
  Fingerprint,
  Loader2,
  QrCode,
  ShieldCheck,
  ShieldX,
  Stethoscope,
  UserRound,
  XCircle,
} from "lucide-react";
import { verifyDoctorPrescription, type PublicVerification } from "@/lib/doctor-rx.functions";
import { DoctorBrand } from "@/components/doctor-rx/DoctorShell";
import {
  ageFromBirth,
  formatDateFr,
  formatDateTimeFr,
  sexLabel,
} from "@/components/doctor-rx/rx-ui";

export const Route = createFileRoute("/medecin/verifier/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Vérification d'ordonnance — SAHA Santé" }],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { token } = Route.useParams();
  const [result, setResult] = useState<PublicVerification | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    verifyDoctorPrescription({ data: { token } })
      .then((res) => alive && setResult(res))
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Vérification impossible");
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const rx = result?.rx;
  const state = !result
    ? "loading"
    : !result.found
      ? "notfound"
      : result.revoked
        ? "revoked"
        : result.valid
          ? "valid"
          : "invalid";

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <DoctorBrand compact />
        <Link to="/medecin" className="rx-btn-ghost px-4 py-2 text-xs">
          <ArrowLeft className="h-3.5 w-3.5" />
          Accueil
        </Link>
      </div>

      {state === "loading" && (
        <div className="rx-glass flex min-h-[320px] flex-col items-center justify-center rounded-[30px] p-8 text-[#9fc4b9]">
          <Loader2 className="h-8 w-8 animate-spin text-[#2ee0aa]" />
          <p className="mt-3 text-sm font-semibold text-white">Vérification en cours…</p>
          <p className="mt-1 text-[11px]">Contrôle de la signature électronique et de l'intégrité.</p>
        </div>
      )}

      {error && (
        <div className="rounded-[26px] border border-rose-300/25 bg-rose-400/10 p-6 text-sm text-rose-200">
          {error}
        </div>
      )}

      {result && state !== "loading" && (
        <>
          {/* Bandeau de statut */}
          <section
            className={[
              "relative overflow-hidden rounded-[30px] border p-6 sm:p-8",
              state === "valid"
                ? "border-emerald-300/30 bg-gradient-to-br from-[#0b6b4f] to-[#043a2c]"
                : state === "revoked"
                  ? "border-amber-300/30 bg-gradient-to-br from-[#6b4b0b] to-[#3a2b04]"
                  : "border-rose-300/30 bg-gradient-to-br from-[#6b1f2a] to-[#3a0d14]",
            ].join(" ")}
          >
            <div className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
            <div className="relative flex flex-wrap items-start gap-4">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-white/15 text-white ring-1 ring-white/25">
                {state === "valid" ? (
                  <ShieldCheck className="h-9 w-9" />
                ) : state === "revoked" ? (
                  <Ban className="h-9 w-9" />
                ) : state === "notfound" ? (
                  <QrCode className="h-9 w-9" />
                ) : (
                  <ShieldX className="h-9 w-9" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
                  Vérification publique SAHA Santé
                </p>
                <h1 className="mt-1 font-display text-3xl leading-tight text-white sm:text-4xl">
                  {state === "valid"
                    ? "Ordonnance authentique"
                    : state === "revoked"
                      ? "Ordonnance annulée"
                      : state === "notfound"
                        ? "Ordonnance introuvable"
                        : "Signature invalide"}
                </h1>
                <p className="mt-2 max-w-2xl text-xs leading-relaxed text-white/80">
                  {state === "valid"
                    ? "La signature électronique correspond exactement au contenu du document. Cette ordonnance peut être délivrée."
                    : state === "revoked"
                      ? result.reason ||
                        "Cette ordonnance a été annulée par le médecin. Ne pas délivrer."
                      : state === "notfound"
                        ? result.reason ||
                          "Aucune ordonnance ne correspond à ce QR code. Vérifiez le code ou contactez le médecin."
                        : result.reason ||
                          "Le contenu ne correspond plus à la signature. Le document a peut-être été modifié. Ne pas délivrer."}
                </p>
                {rx && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/15 px-2.5 py-1 font-mono text-[10px] font-bold text-white">
                      {rx.number}
                    </span>
                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold text-white">
                      Version {rx.version}
                    </span>
                    {rx.signedAt && (
                      <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] text-white">
                        Signée le {formatDateTimeFr(rx.signedAt)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-white/80">
                {state === "valid" ? (
                  <CheckCircle2 className="h-7 w-7" />
                ) : state === "notfound" ? (
                  <AlertTriangle className="h-7 w-7" />
                ) : (
                  <XCircle className="h-7 w-7" />
                )}
              </span>
            </div>
          </section>

          {rx && (
            <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-3">
                {/* Médecin */}
                <section className="rx-card rounded-[24px] p-4 sm:p-5">
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#072b26]">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
                      <Stethoscope className="h-3.5 w-3.5" />
                    </span>
                    Médecin prescripteur
                  </h2>
                  <p className="text-[15px] font-bold text-[#072b26]">{rx.doctorName}</p>
                  <p className="text-[11px] font-semibold text-[#047857]">
                    {rx.doctorSpecialty || "Médecin"}
                  </p>
                  {rx.doctorLicense && (
                    <p className="mt-0.5 text-[10px] text-[#6d8a82]">
                      N° professionnel : {rx.doctorLicense}
                    </p>
                  )}
                  <div className="mt-2 rounded-xl bg-[#f4faf7] px-3 py-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#072b26]">
                      <Building2 className="h-3.5 w-3.5 text-[#047857]" />
                      {rx.establishmentName}
                    </p>
                    {rx.establishmentAddress && (
                      <p className="mt-0.5 text-[10px] text-[#6d8a82]">{rx.establishmentAddress}</p>
                    )}
                    {rx.establishmentPhone && (
                      <p className="mt-0.5 text-[10px] text-[#6d8a82]">Tél. {rx.establishmentPhone}</p>
                    )}
                  </div>
                </section>

                {/* Patient */}
                <section className="rx-card rounded-[24px] p-4 sm:p-5">
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#072b26]">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
                      <UserRound className="h-3.5 w-3.5" />
                    </span>
                    Patient
                  </h2>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[15px] font-bold text-[#072b26]">{rx.patientName}</p>
                      <p className="font-mono text-[10px] text-[#047857]">{rx.patientCode}</p>
                      <p className="mt-0.5 text-[11px] text-[#5f7f76]">
                        {ageFromBirth(rx.patientBirthDate) ?? "—"} ans · {sexLabel(rx.patientSex)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-[#7a978f]">
                        Consultation
                      </p>
                      <p className="text-[12px] font-bold text-[#072b26]">
                        {formatDateFr(rx.consultationDate)}
                      </p>
                    </div>
                  </div>
                  {rx.diagnosis && (
                    <div className="mt-3 rounded-xl bg-[#f4faf7] px-3 py-2">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-[#7a978f]">
                        Diagnostic
                      </p>
                      <p className="mt-0.5 text-[12px] font-semibold text-[#072b26]">
                        {rx.diagnosis}
                      </p>
                    </div>
                  )}
                </section>

                {/* Médicaments */}
                <section className="rx-card rounded-[24px] p-4 sm:p-5">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-[#072b26]">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
                      <Stethoscope className="h-3.5 w-3.5" />
                    </span>
                    Prescription ({rx.items.length})
                  </h2>
                  <div className="divide-y divide-[#eef5f2]">
                    {rx.items.map((item, index) => (
                      <div key={index} className="py-2.5">
                        <p className="text-[12px] font-bold text-[#072b26]">
                          {item.medicineName}
                          {item.dosage ? ` — ${item.dosage}` : ""}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[#4f6f67]">
                          {[item.form, item.posology, item.frequency, item.route]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[#6d8a82]">
                          {[item.duration ? `Durée : ${item.duration}` : "", item.quantity ? `Qté : ${item.quantity}` : ""]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {item.instructions && (
                          <p className="mt-0.5 text-[10px] italic text-[#6d8a82]">
                            {item.instructions}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  {rx.advice && (
                    <div className="mt-2 rounded-xl border border-[#e4efeb] bg-[#fafdfc] px-3 py-2">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-[#047857]">
                        Conseils au patient
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[#274a42]">
                        {rx.advice}
                      </p>
                    </div>
                  )}
                </section>
              </div>

              {/* Signature */}
              <div className="space-y-3">
                <section className="rx-card rounded-[24px] p-4">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-[#072b26]">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
                      <Fingerprint className="h-3.5 w-3.5" />
                    </span>
                    Signature électronique
                  </h2>
                  <div className="space-y-1.5 text-[10px]">
                    <div className="flex justify-between gap-2">
                      <span className="text-[#7a978f]">Statut</span>
                      <span
                        className={
                          result.valid
                            ? "font-bold text-emerald-700"
                            : "font-bold text-rose-600"
                        }
                      >
                        {result.valid ? "Valide" : "Non valide"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-[#7a978f]">Identité patient</span>
                      <span className="font-bold text-[#072b26]">
                        {rx.identityVerified ? "Vérifiée" : "Non vérifiée"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-[#7a978f]">Consultation</span>
                      <span className="font-bold text-[#072b26]">
                        {formatDateFr(rx.consultationDate)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-[#7a978f]">Signée le</span>
                      <span className="font-bold text-[#072b26]">
                        {formatDateTimeFr(rx.signedAt)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-[#7a978f]">Envoyée le</span>
                      <span className="font-bold text-[#072b26]">
                        {formatDateTimeFr(rx.sentAt)}
                      </span>
                    </div>
                  </div>
                  {rx.signatureHash && (
                    <div className="mt-2 rounded-xl bg-[#f4faf7] p-2">
                      <p className="text-[8px] font-bold uppercase tracking-widest text-[#7a978f]">
                        Empreinte HMAC-SHA256
                      </p>
                      <p className="mt-0.5 break-all font-mono text-[8px] leading-relaxed text-[#047857]">
                        {rx.signatureHash}
                      </p>
                    </div>
                  )}
                  {rx.pdfSha256 && (
                    <div className="mt-1.5 rounded-xl bg-[#f4faf7] p-2">
                      <p className="text-[8px] font-bold uppercase tracking-widest text-[#7a978f]">
                        SHA-256 du PDF
                      </p>
                      <p className="mt-0.5 break-all font-mono text-[8px] leading-relaxed text-[#5f7f76]">
                        {rx.pdfSha256}
                      </p>
                    </div>
                  )}
                </section>

                <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                  <p className="flex items-center gap-2 text-[11px] font-bold text-white">
                    <ShieldCheck className="h-4 w-4 text-[#2ee0aa]" />
                    Comment vérifier
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-[#9fc4b9]">
                    Scannez le QR code imprimé sur l'ordonnance ou saisissez le code sur cette
                    page. La signature est recalculée à partir du contenu : toute modification
                    invalide le contrôle.
                  </p>
                  <p className="mt-2 text-[9px] text-[#7da69b]">
                    Vérification effectuée le {formatDateTimeFr(new Date().toISOString())}
                  </p>
                </section>

                <section className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#8fb8ac]">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Validité
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-[#9fc4b9]">
                    Les ordonnances SAHA sont vérifiables tant qu'elles ne sont pas annulées. La
                    version affichée est la version en vigueur au moment du scan.
                  </p>
                </section>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-[10px] text-[#8fb8ac]">
              SAHA Santé — vérification publique des ordonnances électroniques.
            </p>
            <Link to="/medecin" className="text-[10px] font-bold text-[#5ff0c4]">
              En savoir plus
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
