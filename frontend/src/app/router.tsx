import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "@/app/AppLayout";
import { ProtectedRoute } from "@/app/ProtectedRoute";
import { LoginPage } from "@/features/auth/LoginPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { DocumentsPage } from "@/features/documents/DocumentsPage";
import { UploadPage } from "@/features/upload/UploadPage";
import { ChatPage } from "@/features/chat/ChatPage";
import { SearchPage } from "@/features/search/SearchPage";
import { AdminPage } from "@/features/admin/AdminPage";
import { SettingsPage } from "@/features/settings/SettingsPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/", element: <DashboardPage /> },
          { path: "/documents", element: <DocumentsPage /> },
          { path: "/upload", element: <UploadPage /> },
          { path: "/chat", element: <ChatPage /> },
          { path: "/search", element: <SearchPage /> },
          { path: "/admin", element: <AdminPage /> },
          { path: "/settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
]);
