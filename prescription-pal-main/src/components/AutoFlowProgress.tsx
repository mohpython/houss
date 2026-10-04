import { Check, Loader2, X } from "lucide-react";
import type { ReactNode } from "react";

export type StepState = "pending" | "active" | "done" | "error";

export function AutoFlowProgress({
  steps,
}: {
  steps: { icon: ReactNode; label: string; state: StepState }[];
}) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li
          key={i}
          className={`flex items-center gap-3 rounded-2xl border border-border px-4 py-3 transition-opacity ${
            s.state === "pending" ? "opacity-40" : "opacity-100"
          }`}
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
              s.state === "done"
                ? "border-success/30 bg-success/10 text-success"
                : s.state === "error"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-border bg-muted text-primary"
            }`}
            aria-hidden
          >
            {s.state === "done" ? (
              <Check className="h-4 w-4" />
            ) : s.state === "error" ? (
              <X className="h-4 w-4" />
            ) : s.state === "active" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              s.icon
            )}
          </span>
          <span className="text-sm">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
