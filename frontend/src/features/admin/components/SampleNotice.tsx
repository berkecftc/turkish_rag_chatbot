import { Info } from "lucide-react";
import { SampleBadge } from "@/features/analytics/components/SampleBadge";

/**
 * Standardised "this is a SAMPLE shell" banner for admin sections that have no
 * backend endpoint yet (users / roles / audit). Makes the provenance
 * unmistakable and explains that wiring is pending.
 */
export function SampleNotice({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
      <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2">
          <SampleBadge />
        </div>
        <p className="text-muted-foreground">
          {children ??
            "Bu bölüm örnek (gerçek olmayan) verilerle gösterilmektedir. İlgili backend uç noktası henüz mevcut değildir; arayüz, uç nokta hazır olduğunda doğrudan bağlanabilecek şekilde tasarlanmıştır."}
        </p>
      </div>
    </div>
  );
}
