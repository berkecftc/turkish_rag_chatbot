/**
 * Turkish labels + semantic tone for every backend enum value.
 *
 * `tone` maps to design-system semantic tokens so UI badges stay consistent.
 * Never hardcode these strings in components — always go through these maps
 * (typically via `labelFor`).
 */

import type {
  DocumentSource,
  DocumentStatus,
  EmbeddingStatus,
  IngestionStage,
  JobStatus,
  MessageRole,
} from "@/shared/types/enums";

/** Semantic tones mapping to design tokens. */
export type Tone =
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "muted";

export interface EnumLabel {
  label: string;
  tone: Tone;
}

/** A label map keyed by every member of an enum's union type. */
export type LabelMap<T extends string> = Record<T, EnumLabel>;

// ── DocumentSource ──────────────────────────────────────────────────────────
export const documentSourceLabels: LabelMap<DocumentSource> = {
  pdf: { label: "PDF", tone: "default" },
  docx: { label: "Word", tone: "info" },
  xlsx: { label: "Excel", tone: "success" },
  csv: { label: "CSV", tone: "muted" },
  image: { label: "Görsel", tone: "info" },
  txt: { label: "Metin", tone: "muted" },
};

// ── DocumentStatus ──────────────────────────────────────────────────────────
export const documentStatusLabels: LabelMap<DocumentStatus> = {
  pending: { label: "Bekliyor", tone: "muted" },
  processing: { label: "İşleniyor", tone: "info" },
  ready: { label: "Hazır", tone: "success" },
  failed: { label: "Başarısız", tone: "destructive" },
  quarantined: { label: "Karantinada", tone: "warning" },
};

// ── JobStatus ───────────────────────────────────────────────────────────────
export const jobStatusLabels: LabelMap<JobStatus> = {
  queued: { label: "Sırada", tone: "muted" },
  running: { label: "Çalışıyor", tone: "info" },
  succeeded: { label: "Tamamlandı", tone: "success" },
  failed: { label: "Başarısız", tone: "destructive" },
  retrying: { label: "Yeniden deneniyor", tone: "warning" },
  dead: { label: "Sonlandırıldı", tone: "destructive" },
};

// ── IngestionStage ──────────────────────────────────────────────────────────
export const ingestionStageLabels: LabelMap<IngestionStage> = {
  queued: { label: "Sırada", tone: "muted" },
  extract: { label: "Çıkarılıyor", tone: "info" },
  ocr: { label: "OCR", tone: "info" },
  chunk: { label: "Parçalanıyor", tone: "info" },
  embed: { label: "Gömülüyor", tone: "info" },
  index: { label: "İndeksleniyor", tone: "info" },
  done: { label: "Tamamlandı", tone: "success" },
  error: { label: "Hata", tone: "destructive" },
};

// ── EmbeddingStatus ─────────────────────────────────────────────────────────
export const embeddingStatusLabels: LabelMap<EmbeddingStatus> = {
  pending: { label: "Bekliyor", tone: "muted" },
  embedded: { label: "Gömüldü", tone: "success" },
  failed: { label: "Başarısız", tone: "destructive" },
};

// ── MessageRole ─────────────────────────────────────────────────────────────
export const messageRoleLabels: LabelMap<MessageRole> = {
  user: { label: "Kullanıcı", tone: "default" },
  assistant: { label: "Asistan", tone: "info" },
  system: { label: "Sistem", tone: "muted" },
};

/**
 * Resolve a label for an enum value, falling back gracefully to the raw value
 * (with a neutral tone) when the map has no matching entry — protects the UI
 * from crashing if the backend introduces a new enum member.
 */
export function labelFor<T extends string>(
  map: LabelMap<T>,
  value: T | string | null | undefined,
): EnumLabel {
  if (value == null) return { label: "—", tone: "muted" };
  const entry = (map as Record<string, EnumLabel>)[value];
  return entry ?? { label: value, tone: "default" };
}
