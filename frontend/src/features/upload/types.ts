import type { UploadResponse } from "@/shared/types/api";

/** Lifecycle of a single file in the upload center. */
export type UploadPhase =
  | "queued" // accepted, waiting to start
  | "uploading" // multipart in flight (has progress %)
  | "uploaded" // 202 received, ingestion about to be tracked
  | "ingesting" // polling the job
  | "done" // ingestion succeeded
  | "failed"; // upload OR ingestion failed

export interface UploadItemState {
  /** Stable client id (does not come from the server). */
  id: string;
  file: File;
  phase: UploadPhase;
  /** 0–100 upload progress; only meaningful during `uploading`. */
  progress: number;
  /** The 202 response once the upload completes. */
  upload?: UploadResponse;
  /** Job id to poll (from `upload.job_id`). */
  jobId?: string;
  /** Turkish error message when `phase === "failed"` (upload-stage failure). */
  error?: string;
}
