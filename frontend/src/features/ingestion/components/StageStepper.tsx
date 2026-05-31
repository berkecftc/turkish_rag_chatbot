import { Check, Loader2, ScanText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ingestionStageLabels, labelFor } from "@/i18n/labels";
import type { IngestionStage } from "@/shared/types/enums";

/**
 * The ordered, user-visible ingestion pipeline. `error` is intentionally
 * excluded — it is a failure state rendered as an overlay, not a linear step.
 */
export const STEPPER_STAGES = [
  "queued",
  "extract",
  "ocr",
  "chunk",
  "embed",
  "index",
  "done",
] as const satisfies readonly IngestionStage[];

type StepStage = (typeof STEPPER_STAGES)[number];

function stageIndex(stage: IngestionStage): number {
  const i = (STEPPER_STAGES as readonly IngestionStage[]).indexOf(stage);
  return i; // -1 for "error"
}

export interface StageStepperProps {
  /** The job's current stage. */
  stage: IngestionStage;
  /** Whether the job has failed (renders the current step in an error state). */
  failed?: boolean;
  /** Compact horizontal layout (used in dense rows). */
  orientation?: "horizontal" | "vertical";
  className?: string;
}

type StepState = "complete" | "active" | "upcoming" | "failed";

/**
 * Stage stepper over {@link IngestionStage}. Highlights the current stage,
 * marks earlier stages complete, and shows a failure marker when `failed`.
 * Shared between the upload tracker (Phase 6) and document detail (Phase 7).
 */
export function StageStepper({
  stage,
  failed = false,
  orientation = "horizontal",
  className,
}: StageStepperProps) {
  // When failed, anchor the marker at the stage the job reached; "error" maps to
  // the last meaningful in-flight stage so the user sees where it broke.
  const currentIdx = stage === "error" ? -1 : stageIndex(stage);
  const horizontal = orientation === "horizontal";

  return (
    <ol
      className={cn(
        "flex w-full",
        horizontal ? "items-start gap-1" : "flex-col gap-3",
        className,
      )}
      aria-label="Belge işleme aşamaları"
    >
      {STEPPER_STAGES.map((s, idx) => {
        const isDoneStep = s === "done";
        let state: StepState;
        if (failed && idx === Math.max(currentIdx, 0)) {
          state = "failed";
        } else if (currentIdx === -1) {
          // error with no known stage → everything upcoming except a failed first
          state = failed && idx === 0 ? "failed" : "upcoming";
        } else if (idx < currentIdx) {
          state = "complete";
        } else if (idx === currentIdx) {
          state = isDoneStep ? "complete" : "active";
        } else {
          state = "upcoming";
        }

        return (
          <li
            key={s}
            className={cn(
              "flex min-w-0",
              horizontal ? "flex-1 flex-col items-center gap-1.5 text-center" : "items-center gap-3",
            )}
            aria-current={state === "active" ? "step" : undefined}
          >
            <StepMarker stage={s} state={state} />
            <StepConnectorOrLabel stage={s} state={state} horizontal={horizontal} idx={idx} />
          </li>
        );
      })}
    </ol>
  );
}

function StepMarker({ stage, state }: { stage: StepStage; state: StepState }) {
  const isOcr = stage === "ocr";
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors [&_svg]:size-3.5",
        state === "complete" && "border-success bg-success text-success-foreground",
        state === "active" && "border-primary bg-primary/10 text-primary",
        state === "failed" && "border-destructive bg-destructive text-destructive-foreground",
        state === "upcoming" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {state === "complete" ? (
        <Check aria-hidden="true" />
      ) : state === "failed" ? (
        <X aria-hidden="true" />
      ) : state === "active" ? (
        isOcr ? (
          <ScanText aria-hidden="true" className="animate-pulse" />
        ) : (
          <Loader2 aria-hidden="true" className="animate-spin" />
        )
      ) : isOcr ? (
        <ScanText aria-hidden="true" />
      ) : null}
    </span>
  );
}

function StepConnectorOrLabel({
  stage,
  state,
  horizontal,
  idx,
}: {
  stage: StepStage;
  state: StepState;
  horizontal: boolean;
  idx: number;
}) {
  const label = labelFor(ingestionStageLabels, stage).label;
  if (horizontal) {
    return (
      <span
        className={cn(
          "max-w-full truncate text-[11px] leading-tight",
          state === "active" && "font-medium text-foreground",
          state === "failed" && "font-medium text-destructive",
          state === "complete" && "text-muted-foreground",
          state === "upcoming" && "text-muted-foreground/70",
        )}
        title={label}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "text-sm",
        state === "active" && "font-medium text-foreground",
        state === "failed" && "font-medium text-destructive",
        state === "complete" && "text-muted-foreground",
        state === "upcoming" && "text-muted-foreground/70",
      )}
    >
      {/* idx kept for potential numbering; label is primary */}
      <span className="sr-only">{idx + 1}. </span>
      {label}
    </span>
  );
}
