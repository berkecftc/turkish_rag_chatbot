import * as React from "react";
import { Settings as SettingsIcon, User, Palette, MessageSquare, Info, Sun, Moon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { useTheme } from "@/app/providers/ThemeProvider";
import { useCurrentUser } from "@/features/auth/session";
import { usePreferences, type Density } from "@/stores/preferences";
import { trackEvent } from "@/shared/analytics/observability";

/* ------------------------------- helpers -------------------------------- */

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const headingId = React.useId();
  return (
    <Card className="p-5" role="group" aria-labelledby={headingId}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-5">
          {icon}
        </span>
        <div className="space-y-0.5">
          <h2 id={headingId} className="text-base font-semibold text-foreground">
            {title}
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

/** A labelled toggle row (accessible: the <label> is wired to the switch). */
function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  const id = React.useId();
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <label id={id} className="block text-sm font-medium text-foreground">
          {label}
        </label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-labelledby={id} />
    </div>
  );
}

/* ------------------------------- sections ------------------------------- */

function ProfileSection() {
  const user = useCurrentUser();

  if (!user) {
    return (
      <Section icon={<User aria-hidden="true" />} title="Profil">
        <EmptyState
          title="Oturum bilgisi okunamadı"
          description="Geçerli bir oturum bulunamadı."
        />
      </Section>
    );
  }

  return (
    <Section
      icon={<User aria-hidden="true" />}
      title="Profil"
      description="Kimlik bilgileri erişim jetonundan (JWT) okunur. Sunucu tarafında bir profil uç noktası bulunmadığından bu alanlar salt okunurdur."
    >
      <dl className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <dt className="text-sm text-muted-foreground">Kullanıcı kimliği</dt>
          <dd className="font-mono text-sm text-foreground">{user.userId || "—"}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <dt className="text-sm text-muted-foreground">Kiracı kimliği</dt>
          <dd className="font-mono text-sm text-foreground">{user.tenantId || "—"}</dd>
        </div>
        <div className="space-y-1.5">
          <dt className="text-sm text-muted-foreground">İzinler</dt>
          <dd className="flex flex-wrap gap-1">
            {user.perms.length > 0 ? (
              user.perms.map((p) => (
                <Badge key={p} variant="muted" className="font-mono text-[11px]">
                  {p}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">İzin bulunmuyor.</span>
            )}
          </dd>
        </div>
      </dl>
    </Section>
  );
}

function AppearanceSection() {
  // ThemeProvider supports light/dark (no explicit "system" mode in its API),
  // so we offer those two options. Selecting one writes an explicit preference.
  const { theme, setTheme } = useTheme();

  const options: { value: "light" | "dark"; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Açık", icon: <Sun className="size-4" aria-hidden="true" /> },
    { value: "dark", label: "Koyu", icon: <Moon className="size-4" aria-hidden="true" /> },
  ];

  return (
    <Section
      icon={<Palette aria-hidden="true" />}
      title="Görünüm"
      description="Arayüz temasını seçin."
    >
      <fieldset>
        <legend className="sr-only">Tema</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tema seçimi">
          {options.map((opt) => {
            const active = theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setTheme(opt.value);
                  trackEvent("settings.theme_change", { theme: opt.value });
                }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {opt.icon}
                {opt.label}
              </button>
            );
          })}
        </div>
      </fieldset>
    </Section>
  );
}

function ChatPreferencesSection() {
  const streaming = usePreferences((s) => s.streaming);
  const showConfidence = usePreferences((s) => s.showConfidence);
  const showFollowUps = usePreferences((s) => s.showFollowUps);
  const density = usePreferences((s) => s.density);
  const setPreference = usePreferences((s) => s.setPreference);
  const reset = usePreferences((s) => s.reset);

  const densityOptions: { value: Density; label: string }[] = [
    { value: "comfortable", label: "Geniş" },
    { value: "compact", label: "Sıkışık" },
  ];

  return (
    <Section
      icon={<MessageSquare aria-hidden="true" />}
      title="Sohbet tercihleri"
      description="Bu tercihler yalnızca bu tarayıcıda saklanır."
    >
      <div className="divide-y divide-border">
        <ToggleRow
          label="Akış (streaming)"
          description="Yanıtları kelime kelime akıtarak göster."
          checked={streaming}
          onCheckedChange={(v) => {
            setPreference("streaming", v);
            trackEvent("settings.pref_change", { key: "streaming", value: v });
          }}
        />
        <ToggleRow
          label="Güven göstergesi"
          description="Her yanıtta güven puanı ölçerini göster."
          checked={showConfidence}
          onCheckedChange={(v) => setPreference("showConfidence", v)}
        />
        <ToggleRow
          label="Takip önerileri"
          description="Yanıt sonrası takip soru önerilerini göster."
          checked={showFollowUps}
          onCheckedChange={(v) => setPreference("showFollowUps", v)}
        />
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="space-y-0.5">
            <span className="block text-sm font-medium text-foreground">Yoğunluk</span>
            <p className="text-xs text-muted-foreground">Liste ve mesaj aralıklarının sıklığı.</p>
          </div>
          <div className="flex gap-1" role="radiogroup" aria-label="Yoğunluk">
            {densityOptions.map((opt) => {
              const active = density === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPreference("density", opt.value)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-4 border-t border-border pt-4">
        <Button variant="outline" size="sm" onClick={() => reset()}>
          Varsayılanlara sıfırla
        </Button>
      </div>
    </Section>
  );
}

function AboutSection() {
  const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "—";
  return (
    <Section icon={<Info aria-hidden="true" />} title="Hakkında">
      <dl className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-sm text-muted-foreground">Uygulama</dt>
          <dd className="text-sm text-foreground">Turkish RAG Frontend</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-sm text-muted-foreground">Sürüm</dt>
          <dd className="font-mono text-sm text-foreground">v{version}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-sm text-muted-foreground">API tabanı</dt>
          <dd className="font-mono text-sm text-foreground">/api/v1</dd>
        </div>
      </dl>
    </Section>
  );
}

/* -------------------------------- page ---------------------------------- */

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        icon={<SettingsIcon aria-hidden="true" />}
        title="Ayarlar"
        description="Profil, görünüm ve sohbet tercihleri."
      />
      <div className="space-y-5">
        <ProfileSection />
        <AppearanceSection />
        <ChatPreferencesSection />
        <AboutSection />
      </div>
    </div>
  );
}
