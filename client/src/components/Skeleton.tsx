/** Base skeleton pulse block — compose with className for size/shape. */
export default function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-gray-200 ${className}`} />;
}

/* ── Admin table rows skeleton ── */

export function AdminTableRowsSkeleton({
  rows = 5,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-gray-100 px-4 py-3.5 last:border-b-0"
        >
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton
              key={j}
              className={`h-4 ${j === 0 ? "flex-1" : "w-20 shrink-0"}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── Catalog card skeleton ── */

export function CatalogCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4">
      <Skeleton className="h-[180px] w-full !rounded-xl" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-5 w-16 !rounded-full" />
      </div>
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-10 w-28 !rounded-full" />
    </div>
  );
}
