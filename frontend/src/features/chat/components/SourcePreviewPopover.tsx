import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CitationOut } from "@/shared/types/api";
import { ScoreBars, citationScoreRows } from "./ScoreBars";

export interface SourcePreviewPopoverProps {
  citation: CitationOut;
  /** Controlled open state. */
  open: boolean;
  /** Popover id for aria-describedby wiring on the trigger. */
  id: string;
}

/**
 * Floating preview card for a citation. Purely presentational + positioned
 * relative to its trigger wrapper; open/focus handling lives in CitationChip.
 * Shows document title, page/section, excerpt, and the retrieval score bars.
 */
export function SourcePreviewPopover({ citation, open, id }: SourcePreviewPopoverProps) {
  const meta: string[] = [];
  if (citation.page_number != null) meta.push(`Sayfa ${citation.page_number}`);
  if (citation.section) meta.push(citation.section);

  return (
    <span
      role="tooltip"
      id={id}
      hidden={!open}
      className={cn(
        "animate-fade-in absolute bottom-full left-1/2 z-50 mb-2 w-80 -translate-x-1/2",
        "rounded-lg border border-border bg-popover p-3 text-left text-popover-foreground shadow-lg",
        "cursor-default",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <FileText className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={citation.document_title}>
            <span className="mr-1 text-muted-foreground">[{citation.citation_number}]</span>
            {citation.document_title}
          </p>
          {meta.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">{meta.join(" · ")}</p>
          )}
        </div>
      </div>

      {citation.text_excerpt && (
        <p className="mt-2 line-clamp-4 rounded-md bg-muted/50 p-2 text-xs leading-relaxed text-foreground/90">
          {citation.text_excerpt}
        </p>
      )}

      <ScoreBars className="mt-3" rows={citationScoreRows(citation)} />
    </span>
  );
}
