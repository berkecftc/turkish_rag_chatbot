import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Current value, 0–100. When omitted, renders an indeterminate bar. */
  value?: number;
  /** Maximum value. Defaults to 100. */
  max?: number;
  /** Accessible label for the progress bar. */
  label?: string;
  /** Tailwind classes for the filled indicator (e.g. bg-success). */
  indicatorClassName?: string;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, label, indicatorClassName, ...props }, ref) => {
    const indeterminate = value === undefined || value === null;
    const clamped = indeterminate ? 0 : Math.min(Math.max(value, 0), max);
    const pct = indeterminate ? 0 : (clamped / max) * 100;

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={indeterminate ? undefined : clamped}
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-full bg-muted",
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full rounded-full bg-primary transition-[width] duration-300 ease-out",
            indeterminate && "w-1/3 animate-slide-up", // visible motion fallback
            indicatorClassName,
          )}
          style={indeterminate ? undefined : { width: `${pct}%` }}
        />
      </div>
    );
  },
);
Progress.displayName = "Progress";

export { Progress };
