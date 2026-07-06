import * as React from "react";
import { createBrowserRouter } from "react-router-dom";
import { ProtectedRoute, RequirePermission } from "@/app/ProtectedRoute";
import { RouteErrorBoundary } from "@/app/ErrorBoundary";
import { LoadingState } from "@/components/LoadingState";

/* Lazy page imports. Feature pages use named exports, so each loader maps the
   named export onto `default` for React.lazy. Each becomes its own chunk. */
const AppLayout = React.lazy(() =>
  import("@/app/layouts/AppLayout").then((m) => ({ default: m.AppLayout })),
);
const AuthLayout = React.lazy(() =>
  import("@/app/layouts/AuthLayout").then((m) => ({ default: m.AuthLayout })),
);
const LoginPage = React.lazy(() =>
  import("@/features/auth/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const DashboardPage = React.lazy(() =>
  import("@/features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const ChatPage = React.lazy(() =>
  import("@/features/chat/ChatPage").then((m) => ({ default: m.ChatPage })),
);
const DocumentsPage = React.lazy(() =>
  import("@/features/documents/DocumentsPage").then((m) => ({ default: m.DocumentsPage })),
);
const DocumentDetailPage = React.lazy(() =>
  import("@/features/documents/DocumentDetailPage").then((m) => ({
    default: m.DocumentDetailPage,
  })),
);
const UploadPage = React.lazy(() =>
  import("@/features/upload/UploadPage").then((m) => ({ default: m.UploadPage })),
);
const SearchPage = React.lazy(() =>
  import("@/features/search/SearchPage").then((m) => ({ default: m.SearchPage })),
);
const RetrievalPage = React.lazy(() =>
  import("@/features/retrieval/RetrievalPage").then((m) => ({ default: m.RetrievalPage })),
);
const AnalyticsPage = React.lazy(() =>
  import("@/features/analytics/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })),
);
const AdminPage = React.lazy(() =>
  import("@/features/admin/AdminPage").then((m) => ({ default: m.AdminPage })),
);
const SettingsPage = React.lazy(() =>
  import("@/features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const ConversationsPage = React.lazy(() =>
  import("@/features/conversations/ConversationsPage").then((m) => ({
    default: m.ConversationsPage,
  })),
);
const NotFoundPage = React.lazy(() =>
  import("@/features/misc/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);

/** Wraps a lazy page element in Suspense with the shared loading fallback. */
function lazyPage(node: React.ReactNode): React.ReactElement {
  return <React.Suspense fallback={<LoadingState />}>{node}</React.Suspense>;
}

export const router = createBrowserRouter([
  {
    element: lazyPage(<AuthLayout />),
    errorElement: <RouteErrorBoundary />,
    children: [{ path: "/login", element: lazyPage(<LoginPage />) }],
  },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: lazyPage(<AppLayout />),
        errorElement: <RouteErrorBoundary />,
        children: [
          { index: true, element: lazyPage(<DashboardPage />) },
          { path: "chat", element: lazyPage(<ChatPage />) },
          { path: "chat/:conversationId", element: lazyPage(<ChatPage />) },
          { path: "documents", element: lazyPage(<DocumentsPage />) },
          { path: "documents/:id", element: lazyPage(<DocumentDetailPage />) },
          {
            path: "upload",
            element: (
              <RequirePermission perm="document:write">
                {lazyPage(<UploadPage />)}
              </RequirePermission>
            ),
          },
          { path: "search", element: lazyPage(<SearchPage />) },
          { path: "retrieval/:messageId", element: lazyPage(<RetrievalPage />) },
          { path: "analytics", element: lazyPage(<AnalyticsPage />) },
          { path: "conversations", element: lazyPage(<ConversationsPage />) },
          {
            path: "admin",
            element: (
              <RequirePermission perm="admin:manage_users">
                {lazyPage(<AdminPage />)}
              </RequirePermission>
            ),
          },
          { path: "settings", element: lazyPage(<SettingsPage />) },
          { path: "*", element: lazyPage(<NotFoundPage />) },
        ],
      },
    ],
  },
]);
