import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const RX_STATUS: Record<
  string,
  { label: string; className: string; dot: string; description: string }
> = {
  draft: {
    label: "Brouillon",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    description: "Non signée — modifiable",
  },
  signed: {
    label: "Signée",
    className: "bg-sky-50 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
    description: "Signature apposée — prête à envoyer",
  },
  sent: {
    label: "Envoyée",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    description: "Transmise à l'espace patient",
  },
  viewed: {
    label: "Consultée",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-600",
    description: "Consultée par le patient",
  },
  cancelled: {
    label: "Annulée",
    className: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
    description: "Ordonnance annulée",
  },
  amended: {
    label: "Avenant",
    className: "bg-violet-50 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
    description: "Remplacée par une nouvelle version",
  },
};

export function RxStatusBadge({
  status,
  dark = false,
  className,
}: {
  status: string;
  dark?: boolean;
  className?: string;
}) {
  const s = RX_STATUS[status] ?? {
    label: status,
    className: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    description: "",
  };
  if (dark) {
    return (
      <span
        className={cn(
          "rx-chip border border-white/15 bg-white/[0.08] text-[#d9f2ea]",
          className,
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
        {s.label}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "rx-chip border",
        s.className,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

export function formatDateFr(value: string | null | undefined): string {
  if (!value) return "—";
  const key = value.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatDateTimeFr(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ageFromBirth(value: string | null | undefined): number | null {
  if (!value) return null;
  const key = value.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - Number(m[1]);
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  if (month < Number(m[2]) || (month === Number(m[2]) && day < Number(m[3]))) age--;
  return age >= 0 && age < 130 ? age : null;
}

export function patientCode(id: string): string {
  return `SAHA-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function sexLabel(sex: string | null | undefined): string {
  if (sex === "F") return "Féminin";
  if (sex === "M") return "Masculin";
  return sex || "—";
}

export function doctorDisplay(name: string | null | undefined): string {
  const clean = (name ?? "").trim();
  if (!clean) return "Dr. —";
  return /^dr\.?\s/i.test(clean) ? clean : `Dr. ${clean}`;
}

export function SectionTitle({
  icon,
  children,
  action,
}: {
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-[#072b26]">
        {icon}
        {children}
      </h2>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.06] text-[#2ee0aa]">
        {icon}
      </div>
      <p className="text-sm font-bold text-white">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-[#9fc4b9]">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
