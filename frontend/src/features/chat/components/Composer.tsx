import * as React from "react";
import { ArrowUp, Square, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

const MAX_HEIGHT_PX = 200;
const MAX_CHARS = 4000;

export interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  /** Number of active document filters (for the filter affordance badge). */
  filterCount?: number;
  /** Placeholder for the document-filter affordance (stub, non-final). */
  onOpenFilters?: () => void;
}

/**
 * Auto-growing chat composer. Enter sends, Shift+Enter inserts a newline.
 * While streaming, the send button becomes a Stop button that aborts.
 */
export function Composer({
  onSend,
  onStop,
  isStreaming,
  disabled,
  filterCount = 0,
  onOpenFilters,
}: ComposerProps) {
  const [value, setValue] = React.useState("");
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const autoGrow = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, []);

  React.useEffect(autoGrow, [value, autoGrow]);

  const submit = () => {
    const text = value.trim();
    if (!text || isStreaming || disabled) return;
    onSend(text);
    setValue("");
    // Reset height after clearing.
    requestAnimationFrame(() => {
      if (ref.current) ref.current.style.height = "auto";
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const overLimit = value.length > MAX_CHARS;

  return (
    <div className="rounded-2xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring">
      <label htmlFor="chat-composer" className="sr-only">
        Mesajınız
      </label>
      <textarea
        id="chat-composer"
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Belgeleriniz hakkında bir soru sorun…"
        disabled={disabled}
        aria-invalid={overLimit}
        className={cn(
          "block max-h-[200px] w-full resize-none bg-transparent px-4 pt-3 text-sm",
          "placeholder:text-muted-foreground focus-visible:outline-none disabled:opacity-50",
          "[scrollbar-width:thin]",
        )}
      />
      <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1">
        <div className="flex items-center gap-2">
          <Tooltip content="Belge filtresi (yakında)">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              onClick={onOpenFilters}
              aria-label="Belge filtresi"
            >
              <Filter className="size-3.5" />
              Filtre
              {filterCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                  {filterCount}
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
  );
}
