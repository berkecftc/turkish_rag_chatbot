import * as React from "react";
import { NavLink, Outlet, useLocation, Link } from "react-router-dom";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Sun,
  Moon,
  Search as SearchIcon,
  ChevronRight,
  LogOut,
  User as UserIcon,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUI } from "@/stores/ui";
import { useAuth } from "@/stores/auth";
import { useTheme } from "@/app/providers/ThemeProvider";
import { useIsMobile } from "@/shared/hooks/useMediaQuery";
import { usePermissions, decodeAccessToken } from "@/shared/lib/jwt";
import { useLogout } from "@/features/auth/session";
import { NAV_ITEMS, SEGMENT_LABELS, BRAND_NAME } from "@/i18n/nav";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { CommandPalette } from "@/app/CommandPalette";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/* ------------------------------- Sidebar -------------------------------- */

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { has } = usePermissions();
  const items = NAV_ITEMS.filter((item) => !item.perm || has(item.perm));

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-2">
      {items.map(({ to, label, icon: Icon, end }) => {
        const link = (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )
            }
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        );
        return collapsed ? (
          <Tooltip key={to} content={label} side="right">
            {link}
          </Tooltip>
        ) : (
          link
        );
      })}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      to="/"
      className="flex h-14 items-center gap-2 px-4 text-sm font-semibold tracking-tight"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Sparkles className="size-4" aria-hidden="true" />
      </span>
      {!collapsed && <span className="truncate">{BRAND_NAME}</span>}
    </Link>
  );
}

/* ------------------------------ User menu ------------------------------- */

function UserMenu() {
  const accessToken = useAuth((s) => s.accessToken);
  const logout = useLogout();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const claims = decodeAccessToken(accessToken);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleLogout() {
    // Client-only: no server logout endpoint exists. `useLogout` clears tokens,
    // wipes the Query cache, and redirects to /login.
    setOpen(false);
    logout();
  }

  const initial = (claims?.sub?.[0] ?? "U").toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          className="animate-fade-in absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <UserIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{claims?.sub ?? "Kullanıcı"}</span>
            </p>
            {claims?.tid && (
              <p className="mt-0.5 truncate pl-6 text-xs text-muted-foreground">
                Kiracı: {claims.tid}
              </p>
            )}
          </div>
          <Separator />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Çıkış yap
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Breadcrumb ------------------------------ */

function Breadcrumb() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  const crumbs =
    segments.length === 0
      ? [{ label: SEGMENT_LABELS[""], to: "/" }]
      : segments.map((seg, i) => {
          const to = "/" + segments.slice(0, i + 1).join("/");
          const label = SEGMENT_LABELS[seg] ?? decodeURIComponent(seg);
          return { label, to };
        });

  return (
    <nav aria-label="breadcrumb" className="hidden items-center gap-1 text-sm sm:flex">
      {crumbs.map((c, i) => (
        <React.Fragment key={c.to}>
          {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />}
          {i === crumbs.length - 1 ? (
            <span className="font-medium text-foreground">{c.label}</span>
          ) : (
            <Link to={c.to} className="text-muted-foreground hover:text-foreground">
              {c.label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

/* ------------------------------- Top bar -------------------------------- */

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Tooltip content={theme === "dark" ? "Açık tema" : "Koyu tema"}>
      <Button variant="ghost" size="icon" onClick={toggle} aria-label="Tema değiştir">
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
    </Tooltip>
  );
}

/* ------------------------------ AppLayout ------------------------------- */

export function AppLayout() {
  const isMobile = useIsMobile();
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const mobileNavOpen = useUI((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUI((s) => s.setMobileNavOpen);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const { pathname } = useLocation();

  // Global ⌘K / Ctrl+K listener.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Close the mobile drawer on navigation.
  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, setMobileNavOpen]);

  const desktopCollapsed = collapsed;

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Skip-to-content link: visible only on keyboard focus. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        İçeriğe geç
      </a>

      {/* Desktop sidebar */}
      {!isMobile && (
        <aside
          aria-label="Birincil gezinme"
          className={cn(
            "flex shrink-0 flex-col border-r border-border bg-muted/30 transition-[width] duration-200",
            desktopCollapsed ? "w-16" : "w-60",
          )}
        >
          <Brand collapsed={desktopCollapsed} />
          <Separator />
          <SidebarNav collapsed={desktopCollapsed} />
          <Separator />
          <div className={cn("p-2", desktopCollapsed && "flex justify-center")}>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              aria-label={desktopCollapsed ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt"}
            >
              {desktopCollapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </Button>
          </div>
        </aside>
      )}

      {/* Mobile drawer */}
      {isMobile && mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside
            aria-label="Birincil gezinme"
            className="animate-fade-in relative flex w-64 flex-col border-r border-border bg-popover"
          >
            <div className="flex h-14 items-center justify-between pr-2">
              <Brand collapsed={false} />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Menüyü kapat"
              >
                <X className="size-4" />
              </Button>
            </div>
            <Separator />
            <SidebarNav collapsed={false} onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Menüyü aç"
            >
              <Menu className="size-4" />
            </Button>
          )}
          <Breadcrumb />
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:flex"
            >
              <SearchIcon className="size-3.5" aria-hidden="true" />
              <span>Ara…</span>
              <span className="flex items-center gap-0.5">
                <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
            <Tooltip content="Komut paleti">
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden"
                onClick={() => setPaletteOpen(true)}
                aria-label="Komut paletini aç"
              >
                <SearchIcon className="size-4" />
              </Button>
            </Tooltip>
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <main id="main" tabIndex={-1} className="flex-1 overflow-auto p-6 sm:p-8 focus:outline-none">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
