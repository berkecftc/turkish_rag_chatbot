import { Outlet } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { BRAND_NAME } from "@/i18n/nav";

/**
 * Split layout for authentication pages: a branded hero panel (hidden on small
 * screens) beside the routed form `<Outlet/>`.
 */
export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Hero (desktop only) */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-muted/40 p-12 lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          {BRAND_NAME}
        </div>
        <div className="max-w-md space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">
            Belgelerinizle konuşun
          </h2>
          <p className="text-sm text-muted-foreground">
            Kurumsal belge zekâsı platformu. Yükleyin, anlamsal olarak arayın ve
            kaynak alıntılı, güven puanlı yanıtlar alın.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {BRAND_NAME}
        </p>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl"
        />
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center p-6">
        <Outlet />
      </main>
    </div>
  );
}
