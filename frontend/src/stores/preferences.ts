/**
 * Client-persisted user preferences (Phase 13).
 *
 * These are PURELY client-side display/UX preferences — there is no server
 * endpoint for them. Persisted to localStorage so they survive reloads. Chat
 * components read these to decide whether to stream, show confidence meters,
 * etc.
 *
 * NOTE: This is distinct from `stores/ui.ts` (sidebar/theme shell state) and
 * `stores/auth.ts` (tokens). Keep it focused on user-tunable content prefs.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Visual density for message threads and lists. */
export type Density = "comfortable" | "compact";

export interface ChatPreferences {
  /** Stream responses token-by-token (vs. wait for the full answer). */
  streaming: boolean;
  /** Show the per-message confidence meter. */
  showConfidence: boolean;
  /** Show follow-up suggestion chips after an answer. */
  showFollowUps: boolean;
  /** Layout density. */
  density: Density;
}

export const DEFAULT_CHAT_PREFERENCES: ChatPreferences = {
  streaming: true,
  showConfidence: true,
  showFollowUps: true,
  density: "comfortable",
};

interface PreferencesState extends ChatPreferences {
  /** Patch one or more preferences. */
  setPreference: <K extends keyof ChatPreferences>(key: K, value: ChatPreferences[K]) => void;
  /** Reset all chat preferences to their defaults. */
  reset: () => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_CHAT_PREFERENCES,
      setPreference: (key, value) => set({ [key]: value } as Partial<ChatPreferences>),
      reset: () => set({ ...DEFAULT_CHAT_PREFERENCES }),
    }),
    {
      name: "trag-preferences",
      version: 1,
      // Persist only the preference values, never the action functions.
      partialize: (s) => ({
        streaming: s.streaming,
        showConfidence: s.showConfidence,
        showFollowUps: s.showFollowUps,
        density: s.density,
      }),
    },
  ),
);
