import * as React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ShieldX } from "lucide-react";
import { useAuth } from "@/stores/auth";
import { usePermissions } from "@/shared/lib/jwt";
import { ErrorState } from "@/components/ErrorState";

/**
 * Gates the protected route tree. Unauthenticated users are redirected to
 * `/login`, preserving the attempted location in `state.from` so login can
 * return them afterward.
 */
export function ProtectedRoute() {
  const authed = useAuth((s) => s.isAuthenticated());
  const location = useLocation();
  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

/**
 * Renders children only when the current user holds `perm` (from the JWT
 * `perms[]`). Otherwise shows a themed 403 state. RBAC is permission-based,
 * never role-based.
 */
export function RequirePermission({
  perm,
  children,
}: {
  perm: string;
  children: React.ReactNode;
}) {
  const { has } = usePermissions();
  if (!has(perm)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <ErrorState
          className="max-w-md"
          icon={<ShieldX aria-hidden="true" />}
          title="Yetkiniz yok"
          description="Bu sayfayı görüntülemek için gerekli izne sahip değilsiniz."
        />
      </div>
    );
  }
  return <>{children}</>;
}
