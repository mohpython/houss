import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface LoadingButtonProps extends ButtonProps {
  /** When true, shows a spinner and disables the button. */
  loading?: boolean;
  /** Optional text shown next to the spinner while loading. Falls back to children. */
  loadingText?: React.ReactNode;
}

/**
 * Consistent async action button.
 * - Auto-disables while `loading` is true (also honors `disabled`).
 * - Renders a spinner that never changes button width (fixed slot).
 * - Prevents accidental double-submission.
 */
export const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading = false, loadingText, disabled, children, className, ...props }, ref) => {
    const isDisabled = loading || disabled;
    return (
      <Button
        ref={ref}
        aria-busy={loading || undefined}
        aria-disabled={isDisabled || undefined}
        disabled={isDisabled}
        className={cn(className)}
        {...props}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
        {loading ? loadingText ?? children : children}
      </Button>
    );
  },
);
LoadingButton.displayName = "LoadingButton";
