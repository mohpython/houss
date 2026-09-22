import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Shared loading placeholders. They are sized to closely match their real
 * counterparts so the page does not jump when data arrives.
 */

export function ListSkeleton({
  rows = 3,
  rowClassName = "h-20",
  className,
}: {
  rows?: number;
  rowClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("w-full", rowClassName)} />
      ))}
    </div>
  );
}

export function StatsSkeleton({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("grid gap-3", className)}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="mt-3 h-8 w-16" />
          <Skeleton className="mt-2 h-3 w-24" />
        </Card>
      ))}
    </div>
  );
}

export function PageSkeleton({
  title = true,
  rows = 3,
  className,
}: {
  title?: boolean;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto max-w-3xl px-4 py-8", className)} aria-hidden>
      {title && (
        <>
          <Skeleton className="h-7 w-52" />
          <Skeleton className="mt-2 h-4 w-72" />
        </>
      )}
      <ListSkeleton className="mt-6" rows={rows} />
    </div>
  );
}
