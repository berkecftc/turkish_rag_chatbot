import { Sparkles, ArrowUpRight } from "lucide-react";

/**
 * Client-side follow-up suggestion chips shown after a turn completes.
 *
 * IMPORTANT: these are generated locally (lightly derived from the last query)
 * and are NOT backed by any server endpoint — labelled accordingly so we never
 * imply they came from the backend.
 */

const STATIC_STARTERS = [
  "Bunu daha basit açıklar mısın?",
  "Bu konuyla ilgili kaynakları özetler misin?",
  "Bir örnek verebilir misin?",
];

function deriveFollowUps(lastQuery: string | null): string[] {
  if (!lastQuery) return STATIC_STARTERS;
  const trimmed = lastQuery.trim().replace(/[?？]+$/, "");
  const derived = [
    `${trimmed} konusunu detaylandırır mısın?`,
    "Bu yanıtın dayandığı kaynakları özetler misin?",
    "Karşıt görüşler veya istisnalar var mı?",
  ];
  return derived.slice(0, 3);
}

export interface FollowUpsProps {
  lastQuery: string | null;
  onPick: (text: string) => void;
}

export function FollowUps({ lastQuery, onPick }: FollowUpsProps) {
  const suggestions = deriveFollowUps(lastQuery);

  return (
    <div className="mt-4 space-y-2">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="size-3.5" aria-hidden="true" />
        Önerilen sorular
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          istemci tarafı
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {s}
            <ArrowUpRight className="size-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        ))}
      </div>
    </div>
  );
}
