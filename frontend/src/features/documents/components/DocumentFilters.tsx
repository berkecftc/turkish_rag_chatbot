import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { documentStatusLabels, labelFor } from "@/i18n/labels";
import { DOCUMENT_STATUSES, type DocumentStatus } from "@/shared/types/enums";

export type StatusFilter = DocumentStatus | "all";

export interface DocumentFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
}

/** Client-side search box + status segmented filter for the explorer. */
export function DocumentFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
}: DocumentFiltersProps) {
  const options: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "Tümü" },
    ...DOCUMENT_STATUSES.map((s) => ({
      value: s,
      label: labelFor(documentStatusLabels, s).label,
    })),
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Başlığa göre ara…"
          aria-label="Belge başlığına göre ara"
          className="pl-9 pr-9"
        />
        {search && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
            aria-label="Aramayı temizle"
            onClick={() => onSearchChange("")}
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>

      <div
        className="flex flex-wrap gap-1"
        role="group"
        aria-label="Duruma göre filtrele"
      >
        {options.map((opt) => {
          const active = status === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onStatusChange(opt.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                active
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
