import { cn } from "@/lib/utils";

// ============================================================
// Loading Skeleton Components
// ============================================================

function SkeletonBase({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-muted/50",
        className
      )}
      {...props}
    />
  );
}

// ---- Card Skeleton ----
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("glass-card p-6 space-y-4", className)}>
      <SkeletonBase className="h-4 w-3/4" />
      <SkeletonBase className="h-4 w-1/2" />
      <SkeletonBase className="h-32 w-full rounded-xl" />
      <div className="flex gap-2">
        <SkeletonBase className="h-8 w-20" />
        <SkeletonBase className="h-8 w-20" />
        <SkeletonBase className="h-8 w-20" />
      </div>
    </div>
  );
}

// ---- Table Skeleton ----
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex gap-4 pb-2 border-b border-border/50">
        <SkeletonBase className="h-4 w-1/4" />
        <SkeletonBase className="h-4 w-1/4" />
        <SkeletonBase className="h-4 w-1/4" />
        <SkeletonBase className="h-4 w-1/4" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <SkeletonBase className="h-10 w-1/4" />
          <SkeletonBase className="h-10 w-1/4" />
          <SkeletonBase className="h-10 w-1/4" />
          <SkeletonBase className="h-10 w-1/4" />
        </div>
      ))}
    </div>
  );
}

// ---- Stats Card Skeleton ----
export function StatsCardSkeleton() {
  return (
    <div className="glass-card p-6 space-y-3">
      <SkeletonBase className="h-4 w-1/2" />
      <SkeletonBase className="h-8 w-3/4" />
      <SkeletonBase className="h-3 w-1/3" />
    </div>
  );
}

// ---- Metadata Preview Skeleton ----
export function MetadataSkeleton() {
  return (
    <div className="glass-card p-6 flex flex-col md:flex-row gap-6">
      <SkeletonBase className="h-48 w-full md:w-72 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-4">
        <SkeletonBase className="h-6 w-3/4" />
        <SkeletonBase className="h-4 w-1/2" />
        <div className="flex gap-4">
          <SkeletonBase className="h-4 w-16" />
          <SkeletonBase className="h-4 w-16" />
          <SkeletonBase className="h-4 w-16" />
        </div>
        <SkeletonBase className="h-10 w-full rounded-xl" />
        <div className="flex gap-2">
          <SkeletonBase className="h-9 w-20 rounded-lg" />
          <SkeletonBase className="h-9 w-20 rounded-lg" />
          <SkeletonBase className="h-9 w-20 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// ---- Page Skeleton ----
export function PageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <SkeletonBase className="h-10 w-1/3" />
      <SkeletonBase className="h-4 w-2/3" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCardSkeleton />
        <StatsCardSkeleton />
        <StatsCardSkeleton />
      </div>
      <CardSkeleton />
    </div>
  );
}

export { SkeletonBase as Skeleton };
