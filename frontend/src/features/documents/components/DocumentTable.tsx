import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DocumentRow } from "@/features/documents/components/DocumentRow";
import type { DocumentOut } from "@/shared/types/api";

export type SortKey = "title" | "size_bytes" | "created_at";
export type SortDir = "asc" | "desc";

export interface DocumentTableProps {
  docs: DocumentOut[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onDelete: (doc: DocumentOut) => void;
}

interface Column {
  key: SortKey | null;
  label: string;
  className?: string;
}

const COLUMNS: Column[] = [
  { key: "title", label: "Başlık" },
  { key: null, label: "Tür" },
  { key: null, label: "Durum" },
  { key: "size_bytes", label: "Boyut" },
  { key: null, label: "Sayfa" },
  { key: null, label: "Dil" },
  { key: "created_at", label: "Oluşturulma" },
  { key: null, label: "", className: "text-right" },
];

/** Desktop data table for documents with client-side sortable columns. */
export function DocumentTable({
  docs,
  sortKey,
  sortDir,
  onSort,
  onDelete,
}: DocumentTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {COLUMNS.map((col, i) => {
              const sortable = col.key !== null;
              const isActive = sortable && sortKey === col.key;
              return (
                <th
                  key={col.label || `col-${i}`}
                  scope="col"
                  aria-sort={
                    isActive ? (sortDir === "asc" ? "ascending" : "descending") : undefined
                  }
                  className={cn(
                    "px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground",
                    col.className,
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key as SortKey)}
                      className="inline-flex items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {col.label}
                      {isActive ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="size-3" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden="true" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-50" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
