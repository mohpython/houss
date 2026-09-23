import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-8 w-8" } as const;

export function StarRating({ value, onChange, size = "md", className }: StarRatingProps) {
  const readOnly = !onChange;
  return (
    <div className={cn("flex items-center gap-1", className)} role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}/5`}
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          className={cn(
            "rounded-md p-0.5 transition-transform",
            !readOnly && "hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <Star
            className={cn(
              sizes[size],
              n <= value ? "fill-primary text-primary" : "text-muted-foreground/40",
            )}
          />
        </button>
      ))}
    </div>
  );
}
