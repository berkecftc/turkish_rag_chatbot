import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EnumBadge } from "@/components/EnumBadge";
import { embeddingStatusLabels, labelFor } from "@/i18n/labels";
import { formatNumber } from "@/shared/lib/format";
import type { ChunkOut } from "@/shared/types/api";

export interface ChunkListProps {
  chunks: ChunkOut[];
}

/** Single expandable chunk card. */
function ChunkCard({ chunk }: { chunk: ChunkOut }) {
  const [expanded, setExpanded] = React.useState(false);
  const contentId = React.useId();

  return (
    <li className="rounded-lg border border-border bg-card">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <Badge variant="outline" className="shrink-0 tabular-nums">
          #{chunk.chunk_index}
        </Badge>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {chunk.page != null && <span>Sayfa {chunk.page}</span>}
          {chunk.section && (
            <span className="truncate" title={chunk.section}>
              {chunk.section}
            </span>
          )}
          <span>{formatNumber(chunk.token_count)} token</span>
        </div>
        <EnumBadge
          entry={labelFor(embeddingStatusLabels, chunk.embedding_status)}
          className="shrink-0"
        />
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      <div
        id={contentId}
        hidden={!expanded}
        className="border-t border-border px-4 py-3"
      >
        <p
          className={cn(
            "whitespace-pre-wrap text-sm leading-relaxed text-foreground",
            !expanded && "line-clamp-3",
          )}
        >
          {chunk.content}
        </p>
      </div>
    </li>
  );
}

/**
 * Renders document chunks. Each chunk shows index, page, section, token count
 * and embedding status, with an expandable content preview. The list is plain
 * (not windowed) below the threshold; longer lists are capped with an info note
 * since the chunks endpoint is itself paginated.
 */
export function ChunkList({ chunks }: ChunkListProps) {
  return (
    <ul className="space-y-2">
      {chunks.map((chunk) => (
        <ChunkCard key={chunk.id} chunk={chunk} />
      ))}
    </ul>
  );
}
