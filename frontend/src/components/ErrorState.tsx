import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface ErrorStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Override the default warning icon. */
  icon?: React.ReactNode;
  /** Label for the retry button. When omitted with onRetry, no button shows. */
  retryLabel?: string;
  onRetry?: () => void;
}

const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  ({ className, title, description, icon, retryLabel, onRetry, children, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive [&_svg]:size-6">
        {icon ?? <AlertTriangle aria-hidden="true" />}
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-medium text-foreground">{title}</h3>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
      {onRetry && retryLabel && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          {retryLabel}
        </Button>
      )}
    </div>
  ),
);
ErrorState.displayName = "ErrorState";

export { ErrorState };
