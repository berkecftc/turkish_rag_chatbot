/**
 * Provenance badges for analytics charts.
 *
 * `SampleBadge`  → unmistakable "Örnek veri" marker for MOCK datasets.
 * `RealBadge`    → subtle "Gerçek veri" marker for endpoint-derived datasets.
 *
 * Use `<ProvenanceBadge isSample />` to pick automatically.
 */

import { FlaskConical, Database } from "lucide-react";
import { cn } from "@/lib/utils";

export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning [&_svg]:size-3",
        className,
      )}
      title="Bu grafik örnek (gerçek olmayan) verilerle gösterilmektedir."
    >
      <FlaskConical aria-hidden="true" />
      Örnek veri
    </span>
  );
}

export function RealBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success [&_svg]:size-3",
        className,
      )}
      title="Bu grafik gerçek API verilerinden türetilmiştir."
    >
      <Database aria-hidden="true" />
      Gerçek veri
    </span>
  );
}

export function ProvenanceBadge({ isSample }: { isSample: boolean }) {
  return isSample ? <SampleBadge /> : <RealBadge />;
}
