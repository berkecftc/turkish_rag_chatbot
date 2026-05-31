import { List, useDynamicRowHeight, type RowComponentProps } from "react-window";
import type { ChatRow } from "@/features/chat/hooks/useStreamingChat";
import { Message } from "./Message";

/**
 * Above this many stable rows, the thread is virtualized with react-window.
 * The actively-streaming draft is ALWAYS rendered outside any virtualized list
 * (virtualization + per-token height changes conflict), so only persisted rows
 * feed the virtualizer.
 */
const VIRTUALIZE_THRESHOLD = 40;

interface MessageListProps {
  /** Stable (non-streaming) rows. */
  rows: ChatRow[];
  /** The active streaming draft row, rendered outside virtualization. */
  streamingRow?: ChatRow | null;
  onCitationActivate?: (n: number) => void;
  highlightCitation?: number | null;
}

export function MessageList({
  rows,
  streamingRow,
  onCitationActivate,
  highlightCitation,
}: MessageListProps) {
  const virtualize = rows.length > VIRTUALIZE_THRESHOLD;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-1">
      {virtualize ? (
        <VirtualizedRows
          rows={rows}
          onCitationActivate={onCitationActivate}
          highlightCitation={highlightCitation}
        />
      ) : (
        rows.map((row) => (
          <Message
            key={row.key}
            row={row}
            onCitationActivate={onCitationActivate}
            highlightCitation={highlightCitation}
          />
        ))
      )}

      {streamingRow && (
        <Message
          key={streamingRow.key}
          row={streamingRow}
          onCitationActivate={onCitationActivate}
          highlightCitation={highlightCitation}
        />
      )}
    </div>
  );
}

/* ── Virtualized branch (react-window v2) ─────────────────────────────────── */

interface RowData {
  rows: ChatRow[];
  onCitationActivate?: (n: number) => void;
  highlightCitation?: number | null;
}

function VirtualRow({
  index,
  style,
  rows,
  onCitationActivate,
  highlightCitation,
}: RowComponentProps<RowData>) {
  const row = rows[index];
  return (
    <div style={style} className="pb-6">
      <Message
        row={row}
        onCitationActivate={onCitationActivate}
        highlightCitation={highlightCitation}
      />
    </div>
  );
}

function VirtualizedRows({ rows, onCitationActivate, highlightCitation }: RowData) {
  // Dynamic heights: messages vary widely; the cache measures rendered rows.
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: 120 });

  return (
    <List<RowData>
      rowComponent={VirtualRow}
      rowCount={rows.length}
      rowHeight={rowHeight}
      rowProps={{ rows, onCitationActivate, highlightCitation }}
      overscanCount={4}
      style={{ height: "60vh" }}
      className="[scrollbar-width:thin]"
    />
  );
}
