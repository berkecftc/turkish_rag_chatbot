/**
 * Quick action shortcuts. Pure navigation — no backend calls.
 */

import { Link } from "react-router-dom";
import { MessageSquarePlus, UploadCloud, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { usePermissions } from "@/shared/lib/jwt";

interface QuickAction {
  to: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  /** Permission required to show this action. */
  perm?: string;
}

const ACTIONS: QuickAction[] = [
  {
    to: "/chat",
    label: "Yeni sohbet",
    description: "Belgelerinizle konuşun",
    icon: <MessageSquarePlus aria-hidden="true" />,
  },
  {
    to: "/upload",
    label: "Belge yükle",
    description: "PDF, Word, Excel ve daha fazlası",
    icon: <UploadCloud aria-hidden="true" />,
    perm: "document:write",
  },
  {
    to: "/search",
    label: "Arama",
    description: "Anlamsal belge araması",
    icon: <Search aria-hidden="true" />,
  },
];

export function QuickActions() {
  const { has } = usePermissions();
  const actions = ACTIONS.filter((a) => !a.perm || has(a.perm));
  return (
    <section aria-label="Hızlı işlemler">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {actions.map((action) => (
          <Card key={action.to} className="p-0">
            <Link
              to={action.to}
              className="flex items-start gap-3 rounded-lg p-5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">
                {action.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {action.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {action.description}
                </span>
              </span>
            </Link>
          </Card>
        ))}
      </div>
    </section>
  );
}
