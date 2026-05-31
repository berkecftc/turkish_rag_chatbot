/**
 * Re-export of the shared ScoreBars primitive (moved to `@/components/ScoreBars`
 * so search + retrieval can reuse it). Kept here so existing chat imports
 * (`./ScoreBars`) stay valid.
 */
export {
  ScoreBars,
  citationScoreRows,
  retrievalScoreRows,
  type ScoreRow,
  type BarColor,
} from "@/components/ScoreBars";
