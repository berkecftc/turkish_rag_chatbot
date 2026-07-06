import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnumBadge } from "@/components/EnumBadge";
import {
  documentSourceLabels,
  documentStatusLabels,
  labelFor,
} from "@/i18n/labels";
import { formatBytes, formatDate } from "@/shared/lib/format";
import type { DocumentOut } from "@/shared/types/api";

export interface DocumentRowProps {
  doc: DocumentOut;
  /** When omitted, the delete action is hidden (no `document:delete` permission). */
  onDelete?: (doc: DocumentOut) => void;
}

/** A single `<tr>` in the desktop document table. */
export function DocumentRow({ doc, onDelete }: DocumentRowProps) {
  const navigate = useNavigate();
  const open = () => navigate(`/documents/${doc.id}`);

  return (
    <tr
      className="cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-muted/40"
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter") open();
      }}
      tabIndex={0}
      role="link"
      aria-label={`${doc.title} belgesini aç`}
    >
      <td className="max-w-xs px-4 py-3">
        <span className="block truncate font-medium text-foreground" title={doc.title}>
          {doc.title}
        </span>
      </td>
      <td className="px-4 py-3">
        <EnumBadge entry={labelFor(documentSourceLabels, doc.source_type)} />
      </td>
      <td className="px-4 py-3">
        <EnumBadge entry={labelFor(documentStatusLabels, doc.status)} />
      </td>
      <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
        {formatBytes(doc.size_bytes)}
      </td>
      <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
        {doc.page_count ?? "—"}
      </td>
      <td className="px-4 py-3 text-sm uppercase text-muted-foreground">{doc.language}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(doc.created_at)}</td>
      <td className="px-4 py-3 text-right">
        {onDelete && (
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground hover:text-destructive"
            aria-label={`"${doc.title}" belgesini sil`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(doc);
            }}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        )}
      </td>
    </tr>
  );
}
