/**
 * Motion tokens — standard durations, easings, and CSS animation class names.
 *
 * framer-motion is NOT installed yet. To keep this dependency-free, we export
 * plain transition constants plus the names of the Tailwind keyframe animations
 * declared in `tailwind.config.js`. Components apply motion via these class
 * names (e.g. `animate-fade-up`).
 *
 * NOTE: When framer-motion lands in a later phase, add typed `Variants`
 * (fadeUp, stagger, streamCaret, ...) here that reuse DURATION / EASING below,
 * so the design language stays consistent across CSS and JS-driven motion.
 */

/** Durations in milliseconds. */
export const DURATION = {
  instant: 0,
  fast: 120,
  base: 200,
  slow: 300,
  slower: 500,
} as const;

/** Cubic-bezier easing curves (CSS `transition-timing-function` strings). */
export const EASING = {
  /** Standard ease-out — entrances, most UI transitions. */
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  /** Ease-in-out — symmetric movement. */
  inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  /** Ease-in — exits. */
  in: "cubic-bezier(0.4, 0, 1, 1)",
  /** Slight overshoot for playful emphasis. */
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

/**
 * Tailwind animation utility class names, kept in one place so usages stay
 * in sync with `tailwind.config.js#theme.extend.animation`.
 */
export const ANIMATION_CLASS = {
  shimmer: "animate-shimmer",
  fadeIn: "animate-fade-in",
  fadeUp: "animate-fade-up",
  slideUp: "animate-slide-up",
  caretBlink: "animate-caret-blink",
  accordionDown: "animate-accordion-down",
  accordionUp: "animate-accordion-up",
} as const;

/** Convenience: a ready-to-use CSS transition string. */
export function transition(
  property = "all",
  duration: number = DURATION.base,
  easing: string = EASING.out,
): string {
  return `${property} ${duration}ms ${easing}`;
}

export type Duration = keyof typeof DURATION;
export type Easing = keyof typeof EASING;
export type AnimationClass = keyof typeof ANIMATION_CLASS;
