import { AnimatePresence, motion } from "framer-motion";
import { UploadItem } from "@/features/upload/components/UploadItem";
import type { UploadItemState } from "@/features/upload/types";

export interface UploadListProps {
  items: UploadItemState[];
  onChange: (id: string, patch: Partial<UploadItemState>) => void;
  onRemove: (id: string) => void;
}

/** Animated list of in-flight / completed upload rows. */
export function UploadList({ items, onChange, onRemove }: UploadListProps) {
  return (
    <ul className="space-y-3" aria-label="Yüklenen belgeler">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.li
            key={item.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.18 }}
          >
            <UploadItem item={item} onChange={onChange} onRemove={onRemove} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
