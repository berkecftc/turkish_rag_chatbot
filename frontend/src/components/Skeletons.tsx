import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** A block of stacked text lines; the last line is shortened. */
export interface TextSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number;
}

export function TextSkeleton({ lines = 3, className, ...props }: TextSkeletonProps) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Card placeholder: header line, value, and a few content lines. */
export function CardSkeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Card className={cn("space-y-4 p-5", className)} {...props}>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      <TextSkeleton lines={2} />
    </Card>
  );
}

/** Generic list of row placeholders. */
export interface ListSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rows?: number;
}

export function ListSkeleton({ rows = 5, className, ...props }: ListSkeletonProps) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-md border border-border p-3">
          <Skeleton className="size-8 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Table placeholder with a header row. */
export interface TableSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({
  rows = 6,
  columns = 4,
  className,
  ...props
}: TableSkeletonProps) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border", className)} {...props}>
      <div className="flex gap-4 border-b border-border bg-muted/50 p-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-border p-3 last:border-b-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
