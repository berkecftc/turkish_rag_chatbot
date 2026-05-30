import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  /** Desktop sidebar collapsed (icon-only) state. Persisted. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** Mobile drawer open state. Ephemeral (not persisted). */
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      mobileNavOpen: false,
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
    }),
    {
      name: "trag-ui",
      // Only persist durable UI prefs; keep the mobile drawer ephemeral.
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);
