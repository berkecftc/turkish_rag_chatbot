import * as React from "react";
import { cn } from "@/lib/utils";

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Scroll axis. Defaults to vertical. */
  orientation?: "vertical" | "horizontal" | "both";
}

/**
 * Styled scroll container with a thin, themed scrollbar. Dependency-free
 * (native overflow). A Radix ScrollArea with overlay scrollbars can replace
 * this later if custom scrollbar rendering is needed.
 */
const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, orientation = "vertical", children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative",
        orientation === "vertical" && "overflow-y-auto overflow-x-hidden",
        orientation === "horizontal" && "overflow-x-auto overflow-y-hidden",
        orientation === "both" && "overflow-auto",
        // Themed thin scrollbar (WebKit + Firefox).
        "[scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent]",
        "[&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2",
        "[&::-webkit-scrollbar-track]:bg-transparent",
        "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border",
        "hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
ScrollArea.displayName = "ScrollArea";

export { ScrollArea };
