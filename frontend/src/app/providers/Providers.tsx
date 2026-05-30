import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import { queryClient } from "@/lib/queryClient";
import { ThemeProvider } from "@/app/providers/ThemeProvider";

/**
 * Composes all app-wide providers in one place:
 * - TanStack Query (server-state cache)
 * - ThemeProvider (light/dark token switching on <html>)
 * - Framer MotionConfig (respects prefers-reduced-motion globally)
 * - sonner <Toaster/> (themed toasts)
 *
 * The Phase 1 tooltip is dependency-free and needs no provider, so none is
 * mounted here.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MotionConfig reducedMotion="user">
          {children}
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            toastOptions={{
              classNames: {
                toast:
                  "bg-popover text-popover-foreground border border-border shadow-lg",
                description: "text-muted-foreground",
                actionButton: "bg-primary text-primary-foreground",
                cancelButton: "bg-muted text-muted-foreground",
              },
            }}
          />
        </MotionConfig>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
