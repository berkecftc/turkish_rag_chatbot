import * as React from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { EnumLabel, Tone } from "@/i18n/labels";

/**
 * Maps a semantic {@link Tone} (from the i18n label maps) to a {@link Badge}
 * variant. The badge variants are a superset of the tones, so the mapping is
 * mostly 1:1 — `default` stays `default`.
 */
export function toneToBadgeVariant(tone: Tone): NonNullable<BadgeProps["variant"]> {
  switch (tone) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "destructive":
      return "destructive";
    case "info":
      return "info";
    case "muted":
      return "muted";
    default:
      return "secondary";
  }
}

export interface EnumBadgeProps extends Omit<BadgeProps, "variant" | "children"> {
  /** A resolved enum label (label + tone), typically from `labelFor(...)`. */
  entry: EnumLabel;
  /** Optional leading icon. */
  icon?: React.ReactNode;
}

/** Renders a resolved enum label as a tone-coloured badge. */
export function EnumBadge({ entry, icon, ...props }: EnumBadgeProps) {
  return (
    <Badge variant={toneToBadgeVariant(entry.tone)} {...props}>
      {icon}
      {entry.label}
    </Badge>
  );
}
