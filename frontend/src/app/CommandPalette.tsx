import * as React from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { Plus, Upload as UploadIcon, Search as SearchIcon } from "lucide-react";
import { NAV_ITEMS } from "@/i18n/nav";
import { usePermissions } from "@/shared/lib/jwt";
import { cn } from "@/lib/utils";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface QuickAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  /** Permission required to show this action. */
  perm?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "new-chat", label: "Yeni sohbet", icon: Plus, to: "/chat" },
  { id: "upload", label: "Belge yükle", icon: UploadIcon, to: "/upload", perm: "document:write" },
  { id: "search", label: "Arama yap", icon: SearchIcon, to: "/search" },
];

/**
 * Global command palette (⌘K / Ctrl+K). Lists navigation destinations and
 * quick actions. The open/close listener lives in AppLayout; this component
 * owns the dialog UI and selection handling.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { has } = usePermissions();

  const navItems = NAV_ITEMS.filter((item) => !item.perm || has(item.perm));
  const quickActions = QUICK_ACTIONS.filter((item) => !item.perm || has(item.perm));

  const run = React.useCallback(
    (to: string) => {
      onOpenChange(false);
      navigate(to);
    },
    [navigate, onOpenChange],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 backdrop-blur-sm"
      onMouseDown={() => onOpenChange(false)}
    >
      <div
        className="mt-[12vh] w-full max-w-lg px-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Command
          label="Komut paleti"
          className="overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
          loop
        >
          <Command.Input
            autoFocus
            placeholder="Komut veya sayfa ara…"
            className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              Sonuç bulunamadı.
            </Command.Empty>

            <Command.Group
              heading="Hızlı işlemler"
              className="px-1 py-1 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
            >
              {quickActions.map(({ id, label, icon: Icon, to }) => (
                <Command.Item
                  key={id}
                  value={`islem ${label}`}
                  onSelect={() => run(to)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground",
                    "aria-selected:bg-accent aria-selected:text-accent-foreground",
                  )}
                >
                  <Icon className="size-4 text-muted-foreground" />
                  {label}
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group
              heading="Git"
              className="px-1 py-1 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
            >
              {navItems.map(({ to, label, icon: Icon }) => (
                <Command.Item
                  key={to}
                  value={`git ${label}`}
                  onSelect={() => run(to)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground",
                    "aria-selected:bg-accent aria-selected:text-accent-foreground",
                  )}
                >
                  <Icon className="size-4 text-muted-foreground" />
                  {label}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
