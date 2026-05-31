import * as React from "react";
import { cn } from "@/lib/utils";
import type { CitationOut } from "@/shared/types/api";
import { SourcePreviewPopover } from "./SourcePreviewPopover";

export interface CitationChipProps {
  number: number;
  /** Resolved citation (may be undefined for historical messages w/o live data). */
  citation?: CitationOut;
  /** Click/Enter activates the source panel for this citation. */
  onActivate?: (number: number) => void;
}

/**
 * Perplexity-style inline citation pill rendered for `[n]` tokens.
 * Focusable + keyboard accessible: hover/focus reveals the source preview,
 * Escape closes it, Enter/click invokes `onActivate` (opens the side panel).
 * When no live citation exists (historical message), it renders as a static,
 * non-interactive marker so we never fabricate source bodies.
 */
export function CitationChip({ number, citation, onActivate }: CitationChipProps) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const hasData = citation != null;

  if (!hasData) {
    return (
      <sup
        className="mx-0.5 inline-flex h-4 min-w-4 select-none items-center justify-center rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground"
        title="Bu mesaj için kaynak ayrıntısı yalnızca üretim anında akıştan gelir."
      >
        {number}
      </sup>
    );
  }

  return (
    <span className="relative inline-block align-baseline">
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-label={`Kaynak ${number}: ${citation.document_title}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => onActivate?.(number)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onActivate?.(number);
          }
        }}
        className={cn(
          "mx-0.5 inline-flex h-4 min-w-4 translate-y-[-0.3em] select-none items-center justify-center rounded",
          "bg-info/15 px-1 text-[10px] font-semibold text-info transition-colors",
          "hover:bg-info/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {number}
      </button>
      <SourcePreviewPopover citation={citation} open={open} id={id} />
    </span>
  );
}
