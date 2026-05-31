import { DatabaseZap, Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfidenceMeter } from "@/features/chat/components/ConfidenceMeter";

export interface RetrievalHeaderProps {
  messageId: string;
  cacheHit: boolean;
  confidenceScore?: number | null;
}

/** Top summary row: message id, cache-hit badge, confidence meter. */
export function RetrievalHeader({ messageId, cacheHit, confidenceScore }: RetrievalHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
      <span
        className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"
        title={messageId}
      >
        <Hash className="size-3.5" aria-hidden="true" />
        {messageId}
      </span>

      <Badge variant={cacheHit ? "success" : "muted"} className="gap-1">
        <DatabaseZap className="size-3" aria-hidden="true" />
        {cacheHit ? "Önbellekten" : "Önbellek yok"}
      </Badge>

      {confidenceScore != null && (
        <div className="ml-auto">
          <ConfidenceMeter score={confidenceScore} />
        </div>
      )}
    </div>
  );
}
