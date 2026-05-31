import { ArrowRight, Sparkles, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { intentLabel } from "@/i18n/labels";
import { formatLatency } from "@/shared/lib/format";

export interface QueryUnderstandingProps {
  originalQuery: string;
  queryIntent?: string | null;
  rewrittenQuery?: string | null;
  latencyMs?: number | null;
}

/**
 * Surfaces how the backend interpreted the query: detected intent, the
 * rewritten query (original → rewritten), and retrieval latency.
 */
export function QueryUnderstanding({
  originalQuery,
  queryIntent,
  rewrittenQuery,
  latencyMs,
}: QueryUnderstandingProps) {
  const hasRewrite =
    rewrittenQuery != null &&
    rewrittenQuery.trim().length > 0 &&
    rewrittenQuery.trim() !== originalQuery.trim();

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Sparkles className="size-4 text-info" aria-hidden="true" />
          Sorgu yorumu
        </span>
        {queryIntent && (
          <Badge variant="info">{intentLabel(queryIntent)}</Badge>
        )}
        {latencyMs != null && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <Timer className="size-3.5" aria-hidden="true" />
            {formatLatency(latencyMs)}
          </span>
        )}
      </div>

      {hasRewrite ? (
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
          <span className="rounded-md bg-muted/50 px-2 py-1 text-muted-foreground line-through decoration-muted-foreground/40">
            {originalQuery}
          </span>
          <ArrowRight
            className="hidden size-4 shrink-0 text-muted-foreground sm:block"
            aria-hidden="true"
          />
          <span className="rounded-md bg-info/10 px-2 py-1 font-medium text-foreground">
            {rewrittenQuery}
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Sorgu olduğu gibi kullanıldı.
        </p>
      )}
    </Card>
  );
}
