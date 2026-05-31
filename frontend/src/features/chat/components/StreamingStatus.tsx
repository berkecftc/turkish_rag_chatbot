import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamPhase } from "@/stores/chat";

/**
 * The "retrieving" phase has no token signal, so it cycles heuristically
 * through fetch → rerank to communicate progress. Verifying/generating map 1:1.
 */
const RETRIEVING_CYCLE = ["Belgeler getiriliyor", "Yeniden sıralanıyor"] as const;
const CYCLE_MS = 1100;

const PHASE_TEXT: Record<Exclude<StreamPhase, "idle" | "retrieving">, string> = {
  verifying: "Alıntılar doğrulanıyor",
  generating: "Yanıt oluşturuluyor",
};

export interface StreamingStatusProps {
  phase: StreamPhase;
  className?: string;
}

/**
 * Intelligent status line shown while streaming. Renders a shimmering label
 * that reflects the current retrieval/generation phase. Hidden when idle.
 */
export function StreamingStatus({ phase, className }: StreamingStatusProps) {
  const [cycle, setCycle] = React.useState(0);

  React.useEffect(() => {
    if (phase !== "retrieving") return;
    const id = window.setInterval(
      () => setCycle((c) => (c + 1) % RETRIEVING_CYCLE.length),
      CYCLE_MS,
    );
    return () => window.clearInterval(id);
  }, [phase]);

  if (phase === "idle") return null;
  const text = phase === "retrieving" ? RETRIEVING_CYCLE[cycle] : PHASE_TEXT[phase];

  return (
    <div
      className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span className="relative overflow-hidden">
        <span>{text}</span>
        {/* Shimmer sweep over the label. */}
        <span
          aria-hidden="true"
          className="animate-shimmer pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
        />
      </span>
    </div>
  );
}

/** Blinking caret appended to streaming assistant text. */
export function StreamCaret() {
  return (
    <span
      aria-hidden="true"
      className="animate-caret-blink ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[0.15em] bg-foreground/70 align-baseline"
    />
  );
}
