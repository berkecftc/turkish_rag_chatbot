import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export interface PanelProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  /** Right-aligned header slot (badges, totals). */
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Titled card section used across the retrieval inspector panels. */
export function Panel({ title, icon, aside, className, children }: PanelProps) {
  return (
    <Card className={cn("space-y-4 p-4", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground">
          {icon}
          {title}
        </h2>
        {aside && <div className="ml-auto flex items-center gap-2">{aside}</div>}
      </div>
      {children}
    </Card>
  );
}
