import * as React from "react";
import { ChevronDown, FileText, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import type { CitationOut } from "@/shared/types/api";
import { ScoreBars, citationScoreRows } from "./ScoreBars";

interface SourcesListProps {
  citations: Record<number, CitationOut>;
  /** When set, a row matching this number starts expanded (e.g. clicked chip). */
  highlightNumber?: number | null;
  /** Optional message id → enables a "retrieval debug" link per the plan. */
  messageId?: string;
}

/**
 * Numbered, expandable list of all citations for an assistant message.
 * Rendered beneath the message. Each entry expands to show the excerpt and
 * retrieval scores; nothing is fabricated — only fields the backend provided.
 */
export function SourcesList({ citations, highlightNumber, messageId }: SourcesListProps) {
  const items = React.useMemo(
    () => Object.values(citations).sort((a, b) => a.citation_number - b.citation_number),
    [citations],
  );
  const navigate = useNavigate();

  if (items.length === 0) return null;

  return (
    <section className="mt-3 rounded-lg border border-border bg-muted/20">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <BookOpen className="size-3.5" aria-hidden="true" />
          Kaynaklar ({items.length})
        </h4>
        {messageId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => navigate(`/retrieval/${messageId}`)}
          >
            Kaynakları incele
          </Button>
        )}
      </div>
      <ul className="divide-y divide-border">
        {items.map((c) => (
          <SourceRow
            key={c.citation_number}
            citation={c}
            defaultOpen={highlightNumber === c.citation_number}
          />
        ))}
      </ul>
    </section>
  );
}

function SourceRow({ citation, defaultOpen }: { citation: CitationOut; defaultOpen: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  React.useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  const meta: string[] = [];
  if (citation.page_number != null) meta.push(`Sayfa ${citation.page_number}`);
  if (citation.section) meta.push(citation.section);

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40"
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-info/15 text-[10px] font-semibold text-info">
          {citation.citation_number}
        </span>
        <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate" title={citation.document_title}>
          {citation.document_title}
        </span>
        {meta.length > 0 && (
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {meta.join(" · ")}
          </span>
        )}
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="space-y-3 px-3 pb-3 pl-10">
          {citation.text_excerpt && (
            <p className="rounded-md bg-muted/50 p-2 text-xs leading-relaxed text-foreground/90">
              {citation.text_excerpt}
            </p>
          )}
          <ScoreBars rows={citationScoreRows(citation)} />
        </div>
      )}
    </li>
  );
}
