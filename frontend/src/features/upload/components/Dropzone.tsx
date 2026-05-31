import * as React from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/shared/lib/format";
import {
  ACCEPTED_EXTENSIONS_LABEL,
  ACCEPTED_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
} from "@/features/upload/constants";

export interface DropzoneProps {
  /** Called with files that pass client-side type + size validation. */
  onAccepted: (files: File[]) => void;
  /** Called with rejected files so the page can surface Turkish messages. */
  onRejected: (rejections: FileRejection[]) => void;
  disabled?: boolean;
}

/**
 * Drag-and-drop + click-to-browse upload zone. Accessible: the root has
 * `role="button"`, an aria-label, and keyboard activation (Enter/Space) via
 * react-dropzone's keyboard handling.
 */
export function Dropzone({ onAccepted, onRejected, disabled = false }: DropzoneProps) {
  const onDrop = React.useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (accepted.length > 0) onAccepted(accepted);
      if (rejections.length > 0) onRejected(rejections);
    },
    [onAccepted, onRejected],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_UPLOAD_BYTES,
    disabled,
    multiple: true,
  });

  return (
    <div
      {...getRootProps({
        className: cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          disabled
            ? "cursor-not-allowed border-border bg-muted/30 opacity-60"
            : "cursor-pointer hover:border-primary/60 hover:bg-accent/40",
          isDragActive && !isDragReject && "border-primary bg-primary/5",
          isDragReject && "border-destructive bg-destructive/5",
        ),
        role: "button",
        "aria-label":
          "Belge yüklemek için dosyaları buraya sürükleyin ya da tıklayarak seçin",
        "aria-disabled": disabled,
      })}
    >
      <input {...getInputProps()} />
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-6">
        <UploadCloud aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">
          {isDragActive
            ? isDragReject
              ? "Bu dosya türü desteklenmiyor"
              : "Dosyaları bırakın"
            : "Dosyaları buraya sürükleyin veya seçmek için tıklayın"}
        </p>
        <p className="text-sm text-muted-foreground">
          {ACCEPTED_EXTENSIONS_LABEL} • en fazla {formatBytes(MAX_UPLOAD_BYTES)} (
          {MAX_UPLOAD_MB} MB)
        </p>
      </div>
    </div>
  );
}
