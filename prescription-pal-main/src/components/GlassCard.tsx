import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Extra visual weight (deeper background + border glow). */
  featured?: boolean;
  /** Hover lift interaction — set false for static tiles. */
  interactive?: boolean;
}

export function GlassCard({
  children,
  className,
  featured,
  interactive = false,
  ...rest
}: GlassCardProps) {
  return (
    <div
      {...rest}
      className={cn(
        "relative overflow-hidden rounded-3xl glass",
        featured && "ring-1 ring-primary/40",
        interactive &&
          "transition-all duration-300 hover:-translate-y-1 hover:ring-1 hover:ring-primary/50 hover:shadow-[0_25px_70px_-20px_hsl(258_90%_50%/0.55)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
