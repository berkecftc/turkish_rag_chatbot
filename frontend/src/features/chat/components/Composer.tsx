import * as React from "react";
import { ArrowUp, Square, AtSign, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useDocuments } from "@/features/documents/api";
import type { DocumentOut } from "@/shared/types/api";

const MAX_HEIGHT_PX = 200;
const MAX_CHARS = 4000;

export interface ComposerProps {
  /** Sends the message, optionally scoped to specific document ids. */
  onSend: (text: string, documentIds: string[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

/** Detects a trailing "@query" token the user is typing (mention trigger). */
const MENTION_RE = /(?:^|\s)@([^\s@]*)$/;

/**
 * Auto-growing chat composer. Enter sends, Shift+Enter inserts a newline.
 * Typing "@" opens a document picker; chosen documents scope retrieval to
 * themselves (passed to the backend as filters.document_ids) and show as
 * removable chips. While streaming, the send button becomes a Stop button.
 */
export function Composer({ onSend, onStop, isStreaming, disabled }: ComposerProps) {
  const [value, setValue] = React.useState("");
  const [selected, setSelected] = React.useState<DocumentOut[]>([]);
  const [mention, setMention] = React.useState<string | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const { data: documents = [] } = useDocuments({ limit: 100 });

  const autoGrow = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, []);
  React.useEffect(autoGrow, [value, autoGrow]);

  // Documents matching the active "@query", excluding already-selected ones.
  const selectedIds = React.useMemo(() => new Set(selected.map((d) => d.id)), [selected]);
  const suggestions = React.useMemo(() => {
    if (mention == null) return [];
    const q = mention.toLowerCase();
    return documents
      .filter((d) => !selectedIds.has(d.id) && d.title.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mention, documents, selectedIds]);

  const mentionOpen = mention != null && suggestions.length > 0;

  const [prevMention, setPrevMention] = React.useState(mention);
  if (mention !== prevMention) {
    setPrevMention(mention);
    setActiveIndex(0);
  }

  const handleChange = (next: string) => {
    setValue(next);
    const m = next.match(MENTION_RE);
    setMention(m ? m[1] : null);
  };

  const pickDocument = (doc: DocumentOut) => {
    // Strip the trailing "@query" the user was typing.
    setValue((v) => v.replace(MENTION_RE, (match) => (match.startsWith(" ") ? " " : "")));
    setSelected((prev) => (prev.some((d) => d.id === doc.id) ? prev : [...prev, doc]));
    setMention(null);
    requestAnimationFrame(() => ref.current?.focus());
  };

  const removeDocument = (id: string) =>
    setSelected((prev) => prev.filter((d) => d.id !== id));

  const submit = () => {
    const text = value.trim();
    if (!text || isStreaming || disabled) return;
    onSend(text, selected.map((d) => d.id));
    setValue("");
    setMention(null);
    requestAnimationFrame(() => {
      if (ref.current) ref.current.style.height = "auto";
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickDocument(suggestions[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const insertAt = () => {
    const v = value.length === 0 || value.endsWith(" ") ? `${value}@` : `${value} @`;
    handleChange(v);
    requestAnimationFrame(() => ref.current?.focus());
  };

  const overLimit = value.length > MAX_CHARS;

  return (
    <div className="relative">
      {/* Mention dropdown (opens above the composer). */}
      {mentionOpen && (
        <ul
          role="listbox"
          aria-label="Belge seç"
          className="animate-fade-in absolute bottom-full left-0 z-50 mb-2 max-h-64 w-full max-w-md overflow-auto rounded-xl border border-border bg-popover p-1 shadow-lg"
        >
          <li className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
            Belgeyle sınırla
          </li>
          {suggestions.map((doc, i) => (
            <li key={doc.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => pickDocument(doc)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm",
                  i === activeIndex
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent/50",
                )}
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{doc.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-2xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring">
        {/* Selected-document chips. */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-3">
            {selected.map((doc) => (
              <span
                key={doc.id}
                className="inline-flex max-w-[14rem] items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground"
              >
                <FileText className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{doc.title}</span>
                <button
                  type="button"
                  onClick={() => removeDocument(doc.id)}
                  aria-label={`"${doc.title}" filtresini kaldır`}
                  className="ml-0.5 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <label htmlFor="chat-composer" className="sr-only">
          Mesajınız
        </label>
        <textarea
          id="chat-composer"
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Belgeleriniz hakkında bir soru sorun…  (belge seçmek için @ yazın)"
          disabled={disabled}
          aria-invalid={overLimit}
          aria-expanded={mentionOpen}
          aria-controls={mentionOpen ? "mention-list" : undefined}
          className={cn(
            "block max-h-[200px] w-full resize-none bg-transparent px-4 pt-3 text-sm",
            "placeholder:text-muted-foreground focus-visible:outline-none disabled:opacity-50",
            "[scrollbar-width:thin]",
          )}
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1">
          <div className="flex items-center gap-2">
            <Tooltip content="Belge seç (@)">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground"
                onClick={insertAt}
                aria-label="Belgeyle sınırla"
              >
                <AtSign className="size-3.5" />
                Belge
                {selected.length > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                    {selected.length}
                  </span>
                )}
              </Button>
            </Tooltip>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              <kbd className="rounded border border-border px-1">⏎</kbd> gönder ·{" "}
              <kbd className="rounded border border-border px-1">⇧⏎</kbd> yeni satır
            </span>
          </div>

          <div className="flex items-center gap-2">
            {overLimit && (
              <span className="text-[11px] font-medium text-destructive tabular-nums">
                {value.length}/{MAX_CHARS}
              </span>
            )}
            {isStreaming ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={onStop}
                aria-label="Üretimi durdur"
                className="size-8 rounded-full"
              >
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                onClick={submit}
                disabled={!value.trim() || disabled || overLimit}
                aria-label="Gönder"
                className="size-8 rounded-full"
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
