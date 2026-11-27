import { QrCode, ShieldCheck, Stethoscope } from "lucide-react";
import sahaLogo from "@/assets/saha-logo.jpeg.asset.json";
import { cn } from "@/lib/utils";
import { ageFromBirth, formatDateFr, formatDateTimeFr, sexLabel } from "./rx-ui";

export type RxDocumentItem = {
  medicine_name?: string;
  medicineName?: string;
  dosage?: string | null;
  form?: string | null;
  quantity?: string | null;
  posology?: string | null;
  frequency?: string | null;
  duration?: string | null;
  route?: string | null;
  instructions?: string | null;
};

export type RxDocumentProps = {
  number: string;
  version?: number;
  status?: string;
  doctorName: string;
  doctorSpecialty?: string | null;
  doctorLicense?: string | null;
  establishmentName: string;
  establishmentAddress?: string | null;
  establishmentPhone?: string | null;
  patientName: string;
  patientBirthDate?: string | null;
  patientSex?: string | null;
  patientPhone?: string | null;
  patientCode: string;
  consultationDate: string;
  diagnosis?: string | null;
  reason?: string | null;
  observations?: string | null;
  advice?: string | null;
  identityVerified?: boolean;
  signedAt?: string | null;
  signatureHash?: string | null;
  items: RxDocumentItem[];
  verifyUrl?: string | null;
  qrSrc?: string | null;
  compact?: boolean;
  className?: string;
};

function FakeQr({ seed }: { seed: string }) {
  const size = 17;
  const cells = Array.from({ length: size * size }, (_, i) => {
    const x = i % size;
    const y = Math.floor(i / size);
    const finder =
      (x < 5 && y < 5) || (x >= size - 5 && y < 5) || (x < 5 && y >= size - 5);
    if (finder) {
      const lx = x >= size - 5 ? x - (size - 5) : x;
      const ly = y >= size - 5 ? y - (size - 5) : y;
      return lx === 0 || lx === 4 || ly === 0 || ly === 4 || (lx === 2 && ly === 2);
    }
    const h = seed.charCodeAt(i % seed.length) + i * 13 + x * 7 + y * 3;
    return h % 3 !== 0;
  });
  return (
    <div
      aria-hidden
      className="grid overflow-hidden rounded-[3px] bg-white p-1"
      style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, width: 92, height: 92 }}
    >
      {cells.map((on, i) => (
        <span key={i} className={on ? "bg-[#064e3b]" : "bg-white"} />
      ))}
    </div>
  );
}

export function RxDocument(props: RxDocumentProps) {
  const {
    number,
    version = 1,
    status = "draft",
    doctorName,
    doctorSpecialty,
    doctorLicense,
    establishmentName,
    establishmentAddress,
    establishmentPhone,
    patientName,
    patientBirthDate,
    patientSex,
    patientPhone,
    patientCode,
    consultationDate,
    diagnosis,
    reason,
    observations,
    advice,
    identityVerified,
    signedAt,
    signatureHash,
    items,
    verifyUrl,
    qrSrc,
    compact = false,
    className,
  } = props;
  const age = ageFromBirth(patientBirthDate);
  const watermark =
    status === "draft"
      ? "BROUILLON"
      : status === "cancelled"
        ? "ANNULÉE"
        : status === "amended"
          ? "AVENANT"
          : null;

  return (
    <div
      className={cn(
        "rx-paper relative w-full overflow-hidden rounded-[26px]",
        compact ? "text-[11px]" : "text-[12px]",
        className,
      )}
    >
      {watermark && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center overflow-hidden">
          <span className="rotate-[-28deg] whitespace-nowrap text-[74px] font-black tracking-[0.18em] text-[#072b26]/[0.055]">
            {watermark}
          </span>
        </div>
      )}

      {/* En-tête */}
      <header className="relative overflow-hidden bg-[#04241f] px-5 pb-5 pt-5 text-white sm:px-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[#00c995]/20 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white shadow-lg">
              <img src={sahaLogo.url} alt="SAHA Santé" className="h-full w-full object-cover" />
            </span>
            <div>
              <p className="font-display text-xl leading-none text-white">SAHA Santé</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#2ee0aa]">
                e-Ordonnance
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#7fe3c5]">
              Ordonnance électronique
            </p>
            <p className="mt-1 font-mono text-[13px] font-bold text-white">{number}</p>
            <p className="text-[9px] text-[#9fc4b9]">Version {version}</p>
          </div>
        </div>
      </header>

      <div className={cn("px-5 sm:px-7", compact ? "py-4" : "py-5")}>
        {/* Médecin / établissement */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e4efeb] pb-4">
          <div>
            <p className="font-display text-[19px] leading-tight text-[#072b26]">
              {doctorName}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-[#047857]">
              {doctorSpecialty || "Médecin"}
            </p>
            <p className="mt-1 text-[10px] text-[#5f7f76]">
              {doctorLicense ? `N° professionnel : ${doctorLicense}` : "N° professionnel : —"}
              {establishmentPhone ? `  •  Tél. : ${establishmentPhone}` : ""}
            </p>
            <p className="mt-1.5 text-[11px] font-bold text-[#0b3d34]">{establishmentName}</p>
            {establishmentAddress && (
              <p className="text-[10px] text-[#5f7f76]">{establishmentAddress}</p>
            )}
          </div>
          <div className="rounded-xl border border-[#cfe8df] bg-[#f0faf6] px-3 py-2 text-right">
            <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#5f7f76]">
              Date de consultation
            </p>
            <p className="mt-0.5 text-[13px] font-bold text-[#072b26]">
              {formatDateFr(consultationDate)}
            </p>
          </div>
        </div>

        {/* Patient */}
        <div className="mt-4 rounded-2xl border border-[#cfe8df] bg-[#f2faf7] p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-[#047857]">
                Patient
              </p>
              <p className="mt-0.5 text-[15px] font-bold text-[#072b26]">{patientName}</p>
              <p className="mt-1 text-[10px] text-[#4f6f67]">
                {[
                  age != null ? `${age} ans` : "",
                  sexLabel(patientSex),
                  patientPhone ? `Tél. ${patientPhone}` : "",
                ]
                  .filter(Boolean)
                  .join("   •   ")}
              </p>
              <p className="mt-0.5 text-[10px] text-[#4f6f67]">
                Identifiant SAHA : <span className="font-mono">{patientCode}</span>
              </p>
            </div>
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold",
                identityVerified
                  ? "border-[#a7dfca] bg-[#e2f7ee] text-[#047857]"
                  : "border-amber-200 bg-amber-50 text-amber-700",
              )}
            >
              <ShieldCheck className="h-3 w-3" />
              {identityVerified ? "Identité vérifiée" : "Identité à vérifier"}
            </div>
          </div>
        </div>

        {/* Diagnostic */}
        {(diagnosis || reason) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {diagnosis && (
              <div>
                <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#047857]">
                  Diagnostic
                </p>
                <p className="mt-1 text-[12px] font-semibold leading-snug text-[#072b26]">
                  {diagnosis}
                </p>
              </div>
            )}
            {reason && (
              <div>
                <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#5f7f76]">
                  Motif de consultation
                </p>
                <p className="mt-1 text-[11px] leading-snug text-[#3c5a53]">{reason}</p>
              </div>
            )}
          </div>
        )}

        {/* Médicaments */}
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
              <Stethoscope className="h-3.5 w-3.5" />
            </span>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#072b26]">
              Prescription
            </p>
          </div>
          <table className="rx-doc-table w-full table-fixed">
            <thead>
              <tr>
                <th className="w-[43%]">Médicament</th>
                <th className="w-[31%]">Posologie</th>
                <th className="w-[13%]">Durée</th>
                <th className="w-[13%]">Qté</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-5 text-center text-[11px] text-[#8aa39c]">
                    Aucun médicament ajouté pour le moment.
                  </td>
                </tr>
              )}
              {items.map((item, index) => {
                const name = item.medicine_name || item.medicineName || "";
                return (
                  <tr key={index}>
                    <td>
                      <p className="text-[11px] font-bold leading-snug text-[#072b26]">
                        {name || "—"}
                        {item.dosage ? ` — ${item.dosage}` : ""}
                      </p>
                      {(item.form || item.instructions) && (
                        <p className="mt-0.5 text-[9px] leading-snug text-[#6d8a82]">
                          {[item.form, item.instructions].filter(Boolean).join(" • ")}
                        </p>
                      )}
                    </td>
                    <td className="text-[10px] leading-snug text-[#274a42]">
                      {[item.posology, item.frequency, item.route].filter(Boolean).join(" — ") ||
                        "—"}
                    </td>
                    <td className="text-[10px] text-[#4f6f67]">{item.duration || "—"}</td>
                    <td className="text-[10px] text-[#4f6f67]">{item.quantity || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Conseils */}
        {(advice || observations) && (
          <div className="mt-4 space-y-2">
            {advice && (
              <div className="rounded-xl border border-[#e4efeb] bg-[#fafdfc] p-3">
                <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#047857]">
                  Conseils au patient
                </p>
                <p className="mt-1 whitespace-pre-line text-[10.5px] leading-relaxed text-[#274a42]">
                  {advice}
                </p>
              </div>
            )}
            {observations && (
              <div className="rounded-xl border border-[#e4efeb] bg-[#fafdfc] p-3">
                <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#5f7f76]">
                  Observations médicales
                </p>
                <p className="mt-1 whitespace-pre-line text-[10.5px] leading-relaxed text-[#274a42]">
                  {observations}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Signature / cachet / QR */}
        <div className="mt-4 rounded-2xl border border-[#cfe8df] bg-[#f6fbf9] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="relative shrink-0">
              <div className="rx-stamp grid h-[86px] w-[86px] place-items-center rounded-full text-center">
                <div>
                  <div className="mx-auto mb-0.5 grid h-4 w-4 place-items-center">
                    <span className="relative block h-4 w-4">
                      <span className="absolute left-[7px] top-0 h-4 w-[2px] rounded bg-[#0d6b8f]" />
                      <span className="absolute left-0 top-[7px] h-[2px] w-4 rounded bg-[#0d6b8f]" />
                    </span>
                  </div>
                  <p className="text-[6px] font-black uppercase tracking-[0.12em]">SAHA Santé</p>
                  <p className="text-[5.5px] font-bold uppercase tracking-[0.08em]">
                    Cachet numérique
                  </p>
                  <p className="mt-0.5 max-w-[72px] truncate px-1 text-[4.8px] uppercase tracking-wide">
                    {establishmentName}
                  </p>
                  <p className="text-[4.8px] uppercase tracking-wide">Bamako · Mali</p>
                </div>
              </div>
            </div>

            <div className="min-w-[150px] flex-1">
              <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#047857]">
                Signature électronique
              </p>
              <p className="mt-1 font-display text-[22px] italic leading-tight text-[#064e3b]">
                {doctorName.replace(/^dr\.?\s+/i, "Dr. ")}
              </p>
              <div className="mt-0.5 h-px w-40 bg-[#9fd6c4]" />
              <p className="mt-1 text-[9px] text-[#5f7f76]">
                {signedAt ? `Signée le ${formatDateTimeFr(signedAt)}` : "En attente de signature"}
              </p>
              <p className="mt-0.5 break-all text-[8px] text-[#7a978f]">
                Empreinte :{" "}
                {signatureHash ? `${signatureHash.slice(0, 32)}…` : "non signée"}
              </p>
              <p className="mt-1 text-[8px] font-semibold text-[#047857]">
                Vérifiable en ligne — authentification SAHA Santé
              </p>
            </div>

            <div className="flex flex-col items-center gap-1">
              {qrSrc ? (
                <img
                  src={qrSrc}
                  alt="QR code de vérification"
                  className="h-[92px] w-[92px] rounded-[4px] bg-white object-contain"
                />
              ) : (
                <FakeQr seed={number} />
              )}
              <p className="flex items-center gap-1 text-[7.5px] text-[#5f7f76]">
                <QrCode className="h-2.5 w-2.5" />
                Scanner pour vérifier
              </p>
            </div>
          </div>

          {verifyUrl && (
            <p className="mt-2 break-all border-t border-[#e4efeb] pt-2 font-mono text-[7.5px] text-[#6d8a82]">
              {verifyUrl}
            </p>
          )}
        </div>

        <p className="mt-3 text-center text-[7.5px] leading-relaxed text-[#8aa39c]">
          Document généré électroniquement — toute modification invalide la signature. Vérifiez
          l'authenticité en scannant le QR code.
        </p>
      </div>
    </div>
  );
}
