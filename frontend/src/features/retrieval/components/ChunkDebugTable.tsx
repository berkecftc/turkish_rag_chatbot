import * as React from "react";
import { Check, ChevronDown, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/shared/lib/format";
import type { ChunkDebugInfo } from "@/shared/types/api";
import { Panel } from "./Panel";

function fmtScore(v: number | null | undefined): string {
  return v == null ? "—" : formatNumber(v, { maximumFractionDigits: 3 });
}

/** Sort by combined_score; the field is non-nullable in the DTO but guard anyway. */
function byCombinedDesc(a: ChunkDebugInfo, b: ChunkDebugInfo): number {
  return (b.combined_score ?? -Infinity) - (a.combined_score ?? -Infinity);
}

export interface ChunkDebugTableProps {
  chunks: ChunkDebugInfo[];
}

/**
 * Retrieved-chunk table. Sortable by combined score (default desc). Rows
 * included in the final context are visually distinct (ring + check); excluded
 * rows are dimmed. Clicking a row expands the content preview. Collapses to a
 * stacked card layout on small screens.
 */
export function ChunkDebugTable({ chunks }: ChunkDebugTableProps) {
  const [desc, setDesc] = React.useState(true);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());

  const sorted = React.useMemo(() => {
    const copy = [...chunks].sort(byCombinedDesc);
    return desc ? copy : copy.reverse();
  }, [chunks, desc]);

  const toggleRow = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Panel
      title="Getirilen parçalar"
      icon={<Table2 aria-hidden="true" />}
      aside={<span className="text-xs text-muted-foreground">{chunks.length} parça</span>}
    >
      {/* Desktop / tablet: real table. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-2 text-left font-medium">
                Belge
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Sayfa
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Vektör
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                BM25
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                <button
                  type="button"
                  onClick={() => setDesc((d) => !d)}
                  className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  aria-label={`Birleşik skora göre sırala (${desc ? "azalan" : "artan"})`}
                >
                  Birleşik
                  <ChevronDown
                    className={cn("size-3.5 transition-transform", !desc && "rotate-180")}
                    aria-hidden="true"
                  />
                </button>
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Yen. sır.
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Token
              </th>
              <th scope="col" className="px-2 py-2 text-center font-medium">
                Bağlam
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const isOpen = expanded.has(c.chunk_id);
              return (
                <React.Fragment key={c.chunk_id}>
                  <tr
                    onClick={() => toggleRow(c.chunk_id)}
                    className={cn(
                      "cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/40",
                      !c.included_in_context && "opacity-55",
                    )}
                  >
                    <td className="max-w-[16rem] truncate py-2 pr-2" title={c.document_title}>
                      {c.document_title}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {c.page ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmtScore(c.vector_score)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmtScore(c.bm25_score)}</td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums">
                      {fmtScore(c.combined_score)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmtScore(c.rerank_score)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {formatNumber(c.token_count)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {c.included_in_context ? (
                        <span
                          className="inline-flex size-5 items-center justify-center rounded-full bg-confidence-high/15 text-confidence-high ring-1 ring-confidence-high/40"
                          aria-label="Bağlama dahil"
                        >
                          <Check className="size-3" aria-hidden="true" />
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground" aria-label="Bağlam dışı">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-border/60 bg-muted/20">
                      <td colSpan={8} className="px-2 py-2">
                        <p className="text-xs leading-relaxed text-foreground/90">
                          {c.content_preview || "Önizleme mevcut değil."}
                        </p>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards. */}
      <ul className="space-y-2 sm:hidden">
        {sorted.map((c) => {
          const isOpen = expanded.has(c.chunk_id);
          return (
            <li
              key={c.chunk_id}
              className={cn(
                "rounded-lg border border-border p-3",
                c.included_in_context
                  ? "ring-1 ring-confidence-high/30"
                  : "opacity-60",
              )}
            >
              <button
                type="button"
                onClick={() => toggleRow(c.chunk_id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium" title={c.document_title}>
                  {c.document_title}
                </span>
                {c.included_in_context && (
                  <Badge variant="success" className="shrink-0">
                    Bağlamda
                  </Badge>
                )}
                <ChevronDown
                  className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                  aria-hidden="true"
                />
              </button>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <dt>Sayfa</dt>
                  <dd className="tabular-nums text-foreground">{c.page ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Token</dt>
                  <dd className="tabular-nums text-foreground">{formatNumber(c.token_count)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Vektör</dt>
                  <dd className="tabular-nums text-foreground">{fmtScore(c.vector_score)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>BM25</dt>
                  <dd className="tabular-nums text-foreground">{fmtScore(c.bm25_score)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Birleşik</dt>
                  <dd className="tabular-nums font-medium text-foreground">{fmtScore(c.combined_score)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Yen. sır.</dt>
                  <dd className="tabular-nums text-foreground">{fmtScore(c.rerank_score)}</dd>
                </div>
              </dl>
              {isOpen && (
                <p className="mt-2 rounded-md bg-muted/40 p-2 text-xs leading-relaxed text-foreground/90">
                  {c.content_preview || "Önizleme mevcut değil."}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
