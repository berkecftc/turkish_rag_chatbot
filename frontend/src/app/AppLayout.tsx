import { NavLink, Outlet } from "react-router-dom";
import { FileText, MessageSquare, Search, Shield, Settings, Upload, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Panel", icon: LayoutDashboard, end: true },
  { to: "/documents", label: "Belgeler", icon: FileText },
  { to: "/upload", label: "Yükleme", icon: Upload },
  { to: "/chat", label: "Sohbet", icon: MessageSquare },
  { to: "/search", label: "Arama", icon: Search },
  { to: "/admin", label: "Yönetim", icon: Shield },
  { to: "/settings", label: "Ayarlar", icon: Settings },
];

export function AppLayout() {
  return (
    <div className="flex h-screen">
      <aside className="w-60 shrink-0 border-r border-border bg-muted/30 p-4">
        <div className="mb-6 px-2 text-lg font-semibold tracking-tight">Turkish RAG</div>
        <nav className="space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
