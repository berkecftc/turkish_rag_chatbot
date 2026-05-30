import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Keyboard key hint, e.g. <Kbd>⌘</Kbd><Kbd>K</Kbd>.
 */
const Kbd = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-border bg-muted px-1.5",
        "font-mono text-[0.6875rem] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);
Kbd.displayName = "Kbd";

export { Kbd };
