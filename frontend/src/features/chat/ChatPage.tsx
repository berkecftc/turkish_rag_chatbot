import * as React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Plus,
  MessageSquare,
  PanelLeft,
  X,
  Sparkles,
  FileText,
  Search as SearchIcon,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/shared/hooks/useMediaQuery";
import { formatRelativeTime } from "@/shared/lib/format";
import { useConversations } from "@/features/rag/api";
import { useStreamingChat } from "@/features/chat/hooks/useStreamingChat";
import { usePreferences } from "@/stores/preferences";
import { MessageList } from "./components/MessageList";
import { Composer } from "./components/Composer";
import { StreamingStatus } from "./components/StreamingStatus";
import { FollowUps } from "./components/FollowUps";
import type { ConversationOut } from "@/shared/types/api";

const EXAMPLE_PROMPTS = [
  { icon: FileText, text: "Yüklediğim sözleşmenin ana maddelerini özetle." },
  { icon: SearchIcon, text: "Belgelerde geçen teslim sürelerini bul." },
  { icon: ListChecks, text: "Raporun bulgularını maddeler halinde çıkar." },
];

/* ── Conversation rail ────────────────────────────────────────────────────── */

function ConversationRail({
  activeId,
  onNavigate,
}: {
  activeId?: string;
  onNavigate?: () => void;
}) {
  const { data: conversations = [], isLoading } = useConversations({ limit: 100 });
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col">
      <div className="p-2">
        <Button
          className="w-full justify-start gap-2"
          variant="outline"
          onClick={() => {
            navigate("/chat");
            onNavigate?.();
          }}
        >
          <Plus className="size-4" />
          Yeni sohbet
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2 pb-2">
        {isLoading ? (
          <ul className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="h-9 animate-pulse rounded-md bg-muted/60" />
            ))}
          </ul>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Henüz sohbet yok.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((c: ConversationOut) => {
              const active = c.id === activeId;
              return (
                <li key={c.id}>
                  <Link
                    to={`/chat/${c.id}`}
                    onClick={onNavigate}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <MessageSquare className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{c.title || "Adsız sohbet"}</span>
                    </span>
                    {c.last_message_at && (
                      <span className="pl-5.5 truncate text-[11px] text-muted-foreground/80">
                        {formatRelativeTime(c.last_message_at)}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

/* ── Empty / welcome state ────────────────────────────────────────────────── */

function WelcomeState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-foreground text-background">
        <Sparkles className="size-6" aria-hidden="true" />
      </span>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Belgelerinizle sohbet edin</h1>
        <p className="text-sm text-muted-foreground">
          Yüklediğiniz belgelere dayalı, kaynak gösteren yanıtlar alın.
        </p>
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-3">
        {EXAMPLE_PROMPTS.map(({ icon: Icon, text }) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-3 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
            <span>{text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const isMobile = useIsMobile();
  const [railOpen, setRailOpen] = React.useState(false);
  const [highlightCitation, setHighlightCitation] = React.useState<number | null>(null);

  const { messages, isStreaming, phase, lastQuery, send, stop } =
    useStreamingChat(conversationId);

  const threadRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as content streams in (respects user scroll-up).
  const pinnedToBottom = React.useRef(true);
  React.useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      pinnedToBottom.current = dist < 120;
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  React.useEffect(() => {
    if (pinnedToBottom.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages]);

  // Split the live streaming draft from stable rows for the virtualized list.
  const streamingRow = messages.find((m) => m.streaming) ?? null;
  const stableRows = messages.filter((m) => !m.streaming);

  // Respect the user's client-side preference for follow-up suggestions.
  const followUpsEnabled = usePreferences((s) => s.showFollowUps);
  const hasThread = messages.length > 0;
  const showFollowUps =
    followUpsEnabled && !isStreaming && lastQuery != null && hasThread;

  const handleCitationActivate = (n: number) => {
    setHighlightCitation(n);
    // brief reset so the same chip can re-trigger
    window.setTimeout(() => setHighlightCitation((cur) => (cur === n ? null : cur)), 1200);
  };

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] sm:-m-8 sm:h-[calc(100vh-3.5rem)]">
      {/* Desktop rail */}
      {!isMobile && (
        <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-muted/20">
          <ConversationRail activeId={conversationId} />
        </aside>
      )}

      {/* Mobile rail drawer */}
      {isMobile && railOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setRailOpen(false)}
            aria-hidden="true"
          />
          <aside className="animate-fade-in relative flex w-72 flex-col border-r border-border bg-popover">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-medium">Sohbetler</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRailOpen(false)}
                aria-label="Kapat"
              >
                <X className="size-4" />
              </Button>
            </div>
            <ConversationRail
              activeId={conversationId}
              onNavigate={() => setRailOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {isMobile && (
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRailOpen(true)}
              aria-label="Sohbetleri aç"
            >
              <PanelLeft className="size-4" />
            </Button>
            <span className="text-sm font-medium">Sohbet</span>
          </div>
        )}

        <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          {!hasThread ? (
            <WelcomeState onPick={(t) => send(t)} />
          ) : (
            <>
              <MessageList
                rows={stableRows}
                streamingRow={streamingRow}
                onCitationActivate={handleCitationActivate}
                highlightCitation={highlightCitation}
              />
              <div className="mx-auto w-full max-w-3xl">
                {isStreaming && phase !== "idle" && (
                  <div className="mt-4 pl-10">
                    <StreamingStatus phase={phase} />
                  </div>
                )}
                {showFollowUps && (
                  <div className="pl-10">
                    <FollowUps lastQuery={lastQuery} onPick={(t) => send(t)} />
                  </div>
                )}
              </div>
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-border bg-background/80 px-4 py-3 backdrop-blur">
          <div className="mx-auto w-full max-w-3xl">
            <Composer
              onSend={(t, ids) =>
                send(t, ids.length ? { filters: { document_ids: ids } } : undefined)
              }
              onStop={stop}
              isStreaming={isStreaming}
            />
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Yanıtlar yüklediğiniz belgelere dayanır; yine de önemli bilgileri doğrulayın.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
