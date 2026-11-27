import { useEffect, useRef, useState } from "react";
import { Loader2, Search, UserRound, X, Check, Phone, Mail } from "lucide-react";
import {
  searchDoctorPatients,
  type PatientSearchResult,
} from "@/lib/doctor-rx.functions";
import { ageFromBirth, patientCode, sexLabel } from "./rx-ui";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function PatientPicker({
  value,
  onSelect,
  onClear,
  autoFocus = false,
}: {
  value: PatientSearchResult | null;
  onSelect: (patient: PatientSearchResult) => void;
  onClear: () => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (value) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      searchDoctorPatients({ data: { query: q } })
        .then((rows) => {
          if (alive) setResults(rows);
        })
        .catch((e: unknown) => {
          if (alive) setError(e instanceof Error ? e.message : "Recherche impossible");
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 320);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, value]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-[#bfe6d8] bg-[#eefaf5] p-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#0fb98b] to-[#047857] text-sm font-bold text-white shadow-lg shadow-emerald-900/20">
          {initials(value.fullName) || <UserRound className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[#072b26]">{value.fullName}</p>
          <p className="truncate text-[11px] text-[#4f6f67]">
            {[
              value.birthDate ? `${ageFromBirth(value.birthDate)} ans` : "",
              sexLabel(value.sex),
              value.phone || value.email,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-[#047857]">{value.sahaCode}</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="grid h-8 w-8 place-items-center rounded-full border border-[#cfe8df] bg-white text-[#5f7f76] transition hover:bg-[#f3f8f6] hover:text-[#072b26]"
          aria-label="Changer de patient"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a978f]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher par téléphone, e-mail ou nom…"
          className="rx-field pl-10 pr-10"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#00a97c]" />
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-[#dcebe6] bg-white shadow-[0_28px_60px_-20px_rgba(4,30,26,0.45)]">
          <div className="flex items-center justify-between border-b border-[#edf4f1] px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#7a978f]">
              Patients SAHA
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] font-semibold text-[#5f7f76] hover:text-[#072b26]"
            >
              Fermer
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {error && <p className="px-4 py-4 text-xs text-rose-600">{error}</p>}
            {!error && !loading && results.length === 0 && (
              <div className="px-4 py-5 text-xs text-[#5f7f76]">
                Aucun patient trouvé. Le patient doit d'abord créer son compte SAHA Santé avec ce
                numéro ou cet e-mail.
              </div>
            )}
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onSelect(p);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-3 border-b border-[#f1f7f4] px-3 py-2.5 text-left transition hover:bg-[#f4faf7]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e2f7ee] text-xs font-bold text-[#047857]">
                  {initials(p.fullName) || <UserRound className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-[#072b26]">
                    {p.fullName}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[#5f7f76]">
                    {p.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-2.5 w-2.5" />
                        {p.phone}
                      </span>
                    )}
                    {p.email && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <Mail className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{p.email}</span>
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block font-mono text-[9px] text-[#7a978f]">
                    {p.sahaCode} · {p.birthDate ? `${ageFromBirth(p.birthDate)} ans` : "âge —"} ·{" "}
                    {sexLabel(p.sex)}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] font-semibold text-[#047857]">
                  {p.prescriptions > 0 ? `${p.prescriptions} ord.` : "Nouveau"}
                </span>
                <Check className="h-4 w-4 shrink-0 text-[#bfe6d8]" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
