import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf-8"),
) as { version: string };

export default defineConfig({
  plugins: [react()],
  // Expose the app version (from package.json) to the About settings section.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    // Native FS events don't cross the Windows host -> Linux container bind
    // mount, so Vite never sees source edits and keeps serving stale modules.
    // Poll instead so HMR works in Docker dev.
    watch: { usePolling: true, interval: 300 },
    proxy: {
      // In Docker the API is reachable as the compose service `api`, not
      // localhost (which is the frontend container itself). Configurable via
      // env so host-run `npm run dev` keeps using localhost:8000.
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
