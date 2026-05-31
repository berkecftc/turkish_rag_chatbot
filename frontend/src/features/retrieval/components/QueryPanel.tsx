import { ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { intentLabel } from "@/i18n/labels";
import { Panel } from "./Panel";

export interface QueryPanelProps {
  originalQuery: string;
  rewrittenQuery?: string | null;
  queryIntent?: string | null;
}

/** Original → rewritten query plus detected intent. */
export function QueryPanel({ originalQuery, rewrittenQuery, queryIntent }: QueryPanelProps) {
  const hasRewrite =
    rewrittenQuery != null &&
    rewrittenQuery.trim().length > 0 &&
    rewrittenQuery.trim() !== originalQuery.trim();

  return (
    <Panel
      title="Sorgu yorumu"
      icon={<Sparkles aria-hidden="true" />}
      aside={queryIntent ? <Badge variant="info">{intentLabel(queryIntent)}</Badge> : undefined}
    >
      <div className="space-y-2 text-sm">
        <div>
          <span className="text-xs font-medium text-muted-foreground">Özgün sorgu</span>
          <p className="rounded-md bg-muted/50 px-2 py-1 text-foreground">{originalQuery}</p>
        </div>
        {hasRewrite && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="sr-only">Yeniden yazılmış sorgu</span>
            <span className="rounded-md bg-info/10 px-2 py-1 font-medium text-foreground">
              {rewrittenQuery}
            </span>
          </div>
        )}
      </div>
    </Panel>
  );
}
