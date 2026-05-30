import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Skeleton placeholder. Uses an overlaid shimmer sweep (`animate-shimmer`)
 * on top of a muted base for a polished loading affordance.
 */
const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:animate-shimmer before:bg-gradient-to-r",
        "before:from-transparent before:via-foreground/10 before:to-transparent",
        className,
      )}
      {...props}
    />
  ),
);
Skeleton.displayName = "Skeleton";

export { Skeleton };
