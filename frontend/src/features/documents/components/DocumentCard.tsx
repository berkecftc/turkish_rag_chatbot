import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EnumBadge } from "@/components/EnumBadge";
import {
  documentSourceLabels,
  documentStatusLabels,
  labelFor,
} from "@/i18n/labels";
import { formatBytes, formatDate } from "@/shared/lib/format";
import type { DocumentOut } from "@/shared/types/api";

export interface DocumentCardProps {
  doc: DocumentOut;
  /** When omitted, the delete action is hidden (no `document:delete` permission). */
  onDelete?: (doc: DocumentOut) => void;
}

/** Mobile-friendly stacked card representation of a document. */
export function DocumentCard({ doc, onDelete }: DocumentCardProps) {
  const navigate = useNavigate();
  return (
    <Card
      role="link"
      tabIndex={0}
      aria-label={`${doc.title} belgesini aç`}
      onClick={() => navigate(`/documents/${doc.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(`/documents/${doc.id}`);
      }}
      className="cursor-pointer space-y-3 p-4 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate font-medium text-foreground" title={doc.title}>
          {doc.title}
        </p>
        {onDelete && (
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={`"${doc.title}" belgesini sil`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(doc);
            }}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <EnumBadge entry={labelFor(documentSourceLabels, doc.source_type)} />
        <EnumBadge entry={labelFor(documentStatusLabels, doc.status)} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <dt>Boyut</dt>
          <dd className="tabular-nums text-foreground">{formatBytes(doc.size_bytes)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Sayfa</dt>
          <dd className="tabular-nums text-foreground">{doc.page_count ?? "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Dil</dt>
          <dd className="uppercase text-foreground">{doc.language}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Tarih</dt>
          <dd className="text-foreground">{formatDate(doc.created_at)}</dd>
        </div>
      </dl>
    </Card>
  );
}
