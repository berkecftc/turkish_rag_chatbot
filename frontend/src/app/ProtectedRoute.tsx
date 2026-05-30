import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/stores/auth";

export function ProtectedRoute() {
  const authed = useAuth((s) => s.isAuthenticated());
  return authed ? <Outlet /> : <Navigate to="/login" replace />;
}
