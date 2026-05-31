import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Providers } from "@/app/providers/Providers";
import { router } from "@/app/router";
import { installGlobalErrorHandlers } from "@/shared/analytics/observability";
import "@/styles/index.css";

// Frontend observability: capture window errors + unhandled rejections + basic
// web-vitals. Default sink is console (dev) / no-op (prod); swappable later.
installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </React.StrictMode>,
);
