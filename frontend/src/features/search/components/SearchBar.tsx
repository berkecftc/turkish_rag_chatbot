import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const TOP_K_OPTIONS = [5, 10, 20, 50] as const;

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired on Enter / submit. */
  onSubmit: () => void;
  topK: number;
  onTopKChange: (topK: number) => void;
  className?: string;
}

/**
 * Search input with a `top_k` selector. Submits on Enter; exposes a clear
 * button. Debouncing is owned by the page (the input stays controlled here).
 */
export function SearchBar({
  value,
  onChange,
  onSubmit,
  topK,
  onTopKChange,
  className,
}: SearchBarProps) {
  return (
    <form
      role="search"
      className={cn("flex flex-col gap-3 sm:flex-row sm:items-center", className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Belgelerde anlamsal arama yapın…"
          aria-label="Arama sorgusu"
          autoComplete="off"
          className="h-10 pl-9 pr-9"
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Aramayı temizle"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label
          htmlFor="search-top-k"
          className="shrink-0 text-xs font-medium text-muted-foreground"
        >
          Sonuç sayısı
        </label>
        <select
          id="search-top-k"
          value={topK}
          onChange={(e) => onTopKChange(Number(e.target.value))}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {TOP_K_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <Button type="submit" className="h-10 shrink-0">
          Ara
        </Button>
      </div>
    </form>
  );
}
