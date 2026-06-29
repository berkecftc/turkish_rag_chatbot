import * as React from "react";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  /** Tooltip content. Plain text or simple inline nodes. */
  content: React.ReactNode;
  /** The trigger element. Receives hover/focus handlers. */
  children: React.ReactElement;
  side?: Side;
  /** Delay in ms before showing on hover. */
  delay?: number;
  /** Class for the tooltip bubble. */
  className?: string;
  /** Class for the wrapper element (e.g. to make it block-level / full-width). */
  containerClassName?: string;
}

const sideClasses: Record<Side, string> = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
};

/**
 * Lightweight, dependency-free tooltip. Shows on hover and keyboard focus,
 * dismisses on blur / mouse-leave / Escape. Uses `aria-describedby` so the
 * trigger is announced with its description by screen readers.
 *
 * NOTE: positioned with simple CSS (no collision detection). A Radix-based
 * tooltip with flipping/collision handling can replace this in a later phase.
 */
function Tooltip({
  content,
  children,
  side = "top",
  delay = 150,
  className,
  containerClassName,
}: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const show = () => {
    clear();
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clear();
    setOpen(false);
  };

  React.useEffect(() => clear, []);

  const trigger = React.cloneElement(children, {
    "aria-describedby": open ? id : undefined,
    onMouseEnter: (e: React.MouseEvent) => {
      children.props.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      children.props.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      children.props.onFocus?.(e);
      setOpen(true);
    },
    onBlur: (e: React.FocusEvent) => {
      children.props.onBlur?.(e);
      hide();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      children.props.onKeyDown?.(e);
      if (e.key === "Escape") hide();
    },
  });

  return (
    <span className={cn("relative inline-flex", containerClassName)}>
      {trigger}
      <span
        role="tooltip"
        id={id}
        hidden={!open}
        className={cn(
          "pointer-events-none absolute z-50 w-max max-w-xs rounded-md border border-border",
          "bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
          "animate-fade-in",
          sideClasses[side],
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
Tooltip.displayName = "Tooltip";

export { Tooltip };
