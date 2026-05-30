import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Leading icon (e.g. a lucide icon). */
  icon?: React.ReactNode;
  /** Secondary helper text under the value. */
  hint?: React.ReactNode;
  /** Signed delta for trend display; positive renders up, negative down. */
  trend?: { value: string; direction: "up" | "down"; positive?: boolean };
  /** Render skeleton placeholders instead of content. */
  loading?: boolean;
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, label, value, icon, hint, trend, loading = false, ...props }, ref) => {
    return (
      <Card ref={ref} className={cn("p-5", className)} {...props}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
        </div>

        {loading ? (
          <Skeleton className="mt-3 h-8 w-24" />
        ) : (
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        )}

        {(hint || trend) && !loading && (
          <div className="mt-1 flex items-center gap-2 text-xs">
            {trend && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-medium [&_svg]:size-3",
                  (trend.positive ?? trend.direction === "up")
                    ? "text-success"
                    : "text-destructive",
                )}
              >
                {trend.direction === "up" ? (
                  <ArrowUpRight aria-hidden="true" />
                ) : (
                  <ArrowDownRight aria-hidden="true" />
                )}
                {trend.value}
              </span>
            )}
            {hint && <span className="text-muted-foreground">{hint}</span>}
          </div>
        )}
      </Card>
    );
  },
);
StatCard.displayName = "StatCard";

export { StatCard };
