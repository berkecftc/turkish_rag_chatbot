import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional status text announced to assistive tech. */
  label?: string;
  /** Screen-reader fallback used when `label` is omitted. */
  srLabel?: string;
}

const LoadingState = React.forwardRef<HTMLDivElement, LoadingStateProps>(
  ({ className, label, srLabel = "Yükleniyor", ...props }, ref) => (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-muted-foreground",
        className,
      )}
      {...props}
    >
      <Loader2 className="size-6 animate-spin" aria-hidden="true" />
      {label && <p className="text-sm">{label}</p>}
      {!label && <span className="sr-only">{srLabel}</span>}
    </div>
  ),
);
LoadingState.displayName = "LoadingState";

export { LoadingState };
