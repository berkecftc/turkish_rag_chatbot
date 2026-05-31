import { FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ScoreBars, retrievalScoreRows } from "@/components/ScoreBars";
import type { SearchResultItem } from "@/shared/types/api";

export interface ResultCardProps {
  result: SearchResultItem;
}

/**
 * A single search result. Shows the document title, page/section, a content
 * excerpt, and a labelled score-bar row. Clicking the card navigates to the
 * source document.
 */
export function ResultCard({ result }: ResultCardProps) {
  const navigate = useNavigate();

  const meta: string[] = [];
  if (result.page != null) meta.push(`Sayfa ${result.page}`);
  if (result.section) meta.push(result.section);

  const goToDocument = () => navigate(`/documents/${result.document_id}`);

  return (
    <Card
      role="link"
      tabIndex={0}
      onClick={goToDocument}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToDocument();
        }
      }}
      aria-label={`Belgeyi aç: ${result.document_title}`}
      className="cursor-pointer space-y-3 p-4 transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="flex items-start gap-2">
        <FileText
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground" title={result.document_title}>
            {result.document_title}
          </h3>
          {meta.length > 0 && (
            <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p>
          )}
        </div>
      </div>

      <p className="line-clamp-3 text-sm leading-relaxed text-foreground/90">
        {result.content}
      </p>

      <ScoreBars rows={retrievalScoreRows(result)} />
    </Card>
  );
}
