# UI Primitives

Hand-authored, dependency-free primitives styled with the design tokens defined
in `src/styles/index.css` and `tailwind.config.js`. No Radix UI and no shadcn CLI
are used (Radix is not installed). All primitives are typed, accessible
(aria/roles, `focus-visible` ring via `--ring`), and use `forwardRef` where it
makes sense. Compose class names with `cn()` from `@/lib/utils`.

## Available primitives (`@/components/ui/*`)

| File | Exports | Notes |
|------|---------|-------|
| `button.tsx` | `Button`, `buttonVariants` | CVA variants: default / destructive / outline / secondary / ghost / link; sizes: default / sm / lg / icon. Defaults `type="button"`. |
| `card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | Surface container using `bg-card`. |
| `badge.tsx` | `Badge`, `badgeVariants` | Variants: default / secondary / outline / destructive / success / warning / info / muted. |
| `input.tsx` | `Input` | Themed text input with focus ring. |
| `textarea.tsx` | `Textarea` | Themed multiline input. |
| `skeleton.tsx` | `Skeleton` | Muted base with `animate-shimmer` sweep. |
| `separator.tsx` | `Separator` | Horizontal/vertical; `decorative` toggles `role="separator"`. |
| `tooltip.tsx` | `Tooltip` | JS/CSS tooltip (no Radix). Hover + keyboard focus, Escape to dismiss, `aria-describedby`. Simple side positioning (no collision detection). |
| `tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Controlled or uncontrolled; proper `tablist`/`tab`/`tabpanel` roles. |
| `scroll-area.tsx` | `ScrollArea` | Styled native-overflow container with a thin themed scrollbar. |
| `progress.tsx` | `Progress` | Determinate/indeterminate; `role="progressbar"` with aria values. |
| `avatar.tsx` | `Avatar` | Image with initials fallback on error. |
| `kbd.tsx` | `Kbd` | Keyboard key hint chip. |

## Shared composite components (`@/components/*`)

| File | Exports | Notes |
|------|---------|-------|
| `PageHeader.tsx` | `PageHeader` | Title + description + icon + actions. |
| `EmptyState.tsx` | `EmptyState` | Dashed container, icon, title, description, action. |
| `ErrorState.tsx` | `ErrorState` | `role="alert"`, destructive styling, optional retry button. |
| `LoadingState.tsx` | `LoadingState` | Spinner + `role="status"` live region. |
| `StatCard.tsx` | `StatCard` | Metric card with icon, trend, hint, loading skeleton. |
| `ConfidenceBadge.tsx` | `ConfidenceBadge` | Tone high/med/low from `--confidence-*` tokens; derives tone from a 0–1 score. |
| `Skeletons.tsx` | `TextSkeleton`, `CardSkeleton`, `ListSkeleton`, `TableSkeleton` | Skeleton variants composed from `Skeleton`. |

## Theming

- `@/app/providers/ThemeProvider` exposes `<ThemeProvider>` + `useTheme()` →
  `{ theme, setTheme, toggle }`. Applies `light`/`dark` on `<html>`, persists to
  `localStorage["trag-theme"]`, respects `prefers-color-scheme` on first load.
  Not wired into `main.tsx` yet (Phase 2 owns provider composition).

## Motion

- `@/shared/lib/motion` exports `DURATION`, `EASING`, `ANIMATION_CLASS`, and a
  `transition()` helper. framer-motion is not installed; typed variants will be
  added when that dependency lands.

## Deferred to later phases (need Radix or extra deps)

`dialog`, `drawer`/`sheet`, `dropdown-menu`, `popover`, `command` (cmdk),
`sonner` (toast), `select`, `switch`, and `table` are intentionally **not**
built here. They require Radix/cmdk/sonner which are not installed.
