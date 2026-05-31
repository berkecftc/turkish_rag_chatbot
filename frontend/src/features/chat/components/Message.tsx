import * as React from "react";
import { Sparkles, User as UserIcon, FileText } from "lucide-react";
import type { ChatRow } from "@/features/chat/hooks/useStreamingChat";
import { MarkdownContent } from "./MarkdownContent";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { SourcesList } from "./SourcesList";
import { StreamCaret } from "./StreamingStatus";

export interface MessageProps {
  row: ChatRow;
  /** Activate a citation (opens / scrolls to the source row). */
  onCitationActivate?: (n: number) => void;
  /** Currently highlighted source number within this message. */
  highlightCitation?: number | null;
}

/**
 * One chat row. User messages are plain text in a bubble; assistant messages
 * render markdown + inline citations + confidence + a sources list.
 *
 * Memoized so streaming a token only re-renders the active draft row, not the
 * whole thread (the draft row changes identity via `streaming`/content).
 */
function MessageImpl({ row, onCitationActivate, highlightCitation }: MessageProps) {
  if (row.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] items-start gap-3">
          <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
            <p className="whitespace-pre-wrap break-words">{row.content}</p>
          </div>
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserIcon className="size-4" aria-hidden="true" />
          </span>
        </div>
      </div>
    );
  }

  // Assistant.
  const persisted = row.message;
  const confidence = row.doneMeta?.confidence_score ?? persisted?.confidence_score;
  const flags = row.doneMeta?.hallucination_flags ?? persisted?.hallucination_flags;
  const citations = row.citations ?? {};
  const hasLiveCitations = Object.keys(citations).length > 0;
  // Historical message persisted with citations but no live bodies available.
  const historicalCitationCount =
    !hasLiveCitations && persisted?.has_citations ? persisted.citation_count : 0;

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
        <Sparkles className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          {row.content ? (
            <MarkdownContent
              content={row.content}
              citations={citations}
              onCitationActivate={onCitationActivate}
            />
          ) : null}
          {row.streaming && <StreamCaret />}
        </div>

        {!row.streaming && (confidence != null || (flags?.length ?? 0) > 0) && (
          <ConfidenceMeter score={confidence ?? undefined} hallucinationFlags={flags} />
        )}

        {hasLiveCitations && (
          <SourcesList
            citations={citations}
            highlightNumber={highlightCitation}
            messageId={persisted?.id}
          />
        )}

        {historicalCitationCount > 0 && (
          <p className="mt-2 flex items-center gap-1.5 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <FileText className="size-3.5" aria-hidden="true" />
            Bu mesaj {historicalCitationCount} kaynağa dayanıyor. Kaynak ayrıntıları yalnızca
            yanıt üretilirken akıştan gelir.
          </p>
        )}
      </div>
    </div>
  );
}

export const Message = React.memo(MessageImpl);
Message.displayName = "Message";
