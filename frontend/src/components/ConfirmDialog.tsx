import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface ConfirmDialogProps {
  /** Whether the dialog is visible. */
  open: boolean;
  /** Dialog title (Turkish copy). */
  title: React.ReactNode;
  /** Optional supporting description. */
  description?: React.ReactNode;
  /** Confirm button label. Defaults to "Onayla". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Vazgeç". */
  cancelLabel?: string;
  /** Visual emphasis for the confirm action. */
  tone?: "default" | "destructive";
  /** Disables the confirm button + shows a busy label while a mutation runs. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/**
 * Lightweight, accessible confirm modal (no Radix dependency).
 *
 * - `role="dialog" aria-modal`, labelled + described by its title/description.
 * - Focus is moved into the dialog on open and trapped within it (Tab/Shift+Tab).
 * - Escape and backdrop click cancel; focus returns to the opener on close.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Onayla",
  cancelLabel = "Vazgeç",
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const openerRef = React.useRef<Element | null>(null);
  const titleId = React.useId();
  const descId = React.useId();

  // Remember the element that had focus before opening, restore on close.
  React.useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement;
      // Defer so the panel is mounted before focusing.
      const t = window.setTimeout(() => confirmRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    const opener = openerRef.current;
    if (opener instanceof HTMLElement) opener.focus();
    return undefined;
  }, [open]);

  // Lock body scroll while open.
  React.useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (!busy) onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [busy, onCancel],
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={onKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-fade-in"
        onClick={() => !busy && onCancel()}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg animate-slide-up"
      >
        <div className="flex gap-4">
          {tone === "destructive" && (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive [&_svg]:size-5">
              <AlertTriangle aria-hidden="true" />
            </span>
          )}
          <div className="space-y-1.5">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={tone === "destructive" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={busy}
            className={cn(busy && "pointer-events-none")}
          >
            {busy ? "İşleniyor…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
