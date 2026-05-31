import { Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/shared/lib/format";
import type { ChunkDebugInfo } from "@/shared/types/api";
import { Panel } from "./Panel";

export interface ContextAllocationProps {
  chunks: ChunkDebugInfo[];
  contextTokens: number;
  wasCompressed: boolean;
}

/**
 * Token-allocation bar: each retrieved chunk's `token_count` as a proportional
 * segment. Chunks included in the final context are highlighted; excluded ones
 * are dimmed. The denominator is the larger of `context_tokens` and the sum of
 * included tokens, so the included portion never overflows the track.
 */
export function ContextAllocation({ chunks, contextTokens, wasCompressed }: ContextAllocationProps) {
  const includedTokens = chunks
    .filter((c) => c.included_in_context)
    .reduce((acc, c) => acc + (c.token_count ?? 0), 0);

  const totalTokens = chunks.reduce((acc, c) => acc + (c.token_count ?? 0), 0);
  const scale = Math.max(contextTokens, includedTokens, totalTokens, 1);

  return (
    <Panel
      title="Bağlam tahsisi"
      icon={<Layers aria-hidden="true" />}
      aside={
        <div className="flex items-center gap-2">
          {wasCompressed && <Badge variant="warning">Sıkıştırıldı</Badge>}
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatNumber(contextTokens)} token
          </span>
        </div>
      }
    >
      <div className="space-y-3">
        <div
          className="flex h-3 w-full gap-px overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`Bağlamda ${formatNumber(includedTokens)} token, toplam ${formatNumber(totalTokens)} token getirildi`}
        >
          {chunks.map((c, i) => {
            const width = (c.token_count / scale) * 100;
            if (width <= 0) return null;
            return (
              <div
                key={c.chunk_id}
                className={c.included_in_context ? "bg-chart-1" : "bg-muted-foreground/25"}
                style={{ width: `${width}%` }}
                title={`${c.document_title} · ${formatNumber(c.token_count)} token · ${
                  c.included_in_context ? "bağlamda" : "hariç"
                }`}
                aria-hidden="true"
                data-chunk-index={i}
              />
            );
          })}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-chart-1" aria-hidden="true" />
            Bağlama dahil · {formatNumber(includedTokens)} token
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-muted-foreground/25" aria-hidden="true" />
            Hariç tutulan
          </span>
        </div>
      </div>
    </Panel>
  );
}
