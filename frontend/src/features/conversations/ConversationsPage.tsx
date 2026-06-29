import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  MessagesSquare,
  Search as SearchIcon,
  MessageSquare,
  Coins,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useConversationsPage, useDeleteConversation } from "@/features/rag/api";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { formatRelativeTime, formatNumber, truncate } from "@/shared/lib/format";
import type { ConversationOut } from "@/shared/types/api";

const PAGE_SIZE = 20;

function ConversationCard({ conv }: { conv: ConversationOut }) {
  const title = conv.title?.trim() || "Başlıksız konuşma";
  return (
    <Link
      to={`/chat/${conv.id}`}
      className="block rounded-lg border border-border bg-card p-4 pr-12 transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-foreground">{title}</h3>
          {conv.summary && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {truncate(conv.summary, 160)}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3.5" aria-hidden="true" />
              {formatNumber(conv.total_messages)} mesaj
            </span>
            <span className="inline-flex items-center gap-1">
              <Coins className="size-3.5" aria-hidden="true" />
              {formatNumber(conv.total_tokens_used)} jeton
            </span>
            <span>
              {conv.last_message_at
                ? `Son: ${formatRelativeTime(conv.last_message_at)}`
                : `Oluşturuldu: ${formatRelativeTime(conv.created_at)}`}
            </span>
          </div>
        </div>
        <ChevronRight
          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}

export function ConversationsPage() {
  const [page, setPage] = React.useState(0);
  const [rawSearch, setRawSearch] = React.useState("");
  const search = useDebounce(rawSearch, 250).trim().toLocaleLowerCase("tr-TR");
  const [confirm, setConfirm] = React.useState<{ id: string; title: string } | null>(null);
  const del = useDeleteConversation();

  const handleDelete = () => {
    if (!confirm) return;
    const { title } = confirm;
    del.mutate(confirm.id, {
      onSuccess: () => {
        toast.success(`"${title}" silindi.`);
        setConfirm(null);
      },
      onError: () => toast.error("Sohbet silinemedi."),
    });
  };

  const { data, isLoading, isError, isFetching, refetch } = useConversationsPage({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const conversations = data ?? [];

  // Client-side title search over the loaded page.
  const filtered = React.useMemo(() => {
    if (!search) return conversations;
    return conversations.filter((c) =>
      (c.title ?? "").toLocaleLowerCase("tr-TR").includes(search),
    );
  }, [conversations, search]);

  const hasNextPage = conversations.length === PAGE_SIZE;
  const showInitialLoading = isLoading && page === 0;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        icon={<MessagesSquare aria-hidden="true" />}
        title="Konuşmalar"
        description="Geçmiş sohbet konuşmalarınız."
      />

      <div className="mb-5">
        <label htmlFor="conv-search" className="sr-only">
          Konuşmalarda ara
        </label>
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="conv-search"
            type="search"
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            placeholder="Başlığa göre ara…"
            className="pl-9"
          />
        </div>
      </div>

      {showInitialLoading && (
        <div className="space-y-3" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      )}

      {isError && !isLoading && (
        <ErrorState
          title="Konuşmalar yüklenemedi"
          description="Konuşma listesi alınırken bir hata oluştu."
          retryLabel="Tekrar dene"
          onRetry={() => void refetch()}
        />
      )}

      {!showInitialLoading && !isError && conversations.length === 0 && (
        <EmptyState
          icon={<MessagesSquare aria-hidden="true" />}
          title="Henüz konuşma yok"
          description="Bir sohbet başlattığınızda konuşmalarınız burada görünecek."
          action={
            <Link to="/chat" className={buttonVariants({ size: "sm" })}>
              Yeni sohbet
            </Link>
          }
        />
      )}

      {!showInitialLoading && !isError && conversations.length > 0 && (
        <>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<SearchIcon aria-hidden="true" />}
              title="Sonuç bulunamadı"
              description={`"${rawSearch}" için bu sayfada eşleşen konuşma yok.`}
            />
          ) : (
            <ul className="space-y-3">
              {filtered.map((conv) => (
                <li key={conv.id} className="group relative">
                  <ConversationCard conv={conv} />
                  <button
                    type="button"
                    onClick={() =>
                      setConfirm({
                        id: conv.id,
                        title: conv.title?.trim() || "Başlıksız konuşma",
                      })
                    }
                    aria-label={`"${conv.title?.trim() || "Başlıksız konuşma"}" konuşmasını sil`}
                    className={cn(
                      "absolute right-3 top-3 flex size-8 items-center justify-center rounded-md text-muted-foreground",
                      "opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Pagination */}
          {(page > 0 || hasNextPage) && (
            <div className="mt-6 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0 || isFetching}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Önceki
              </Button>
              <span className="text-xs text-muted-foreground" aria-live="polite">
                Sayfa {page + 1}
                {isFetching && " · yükleniyor…"}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNextPage || isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Sonraki
              </Button>
            </div>
          )}
        </>
      )}

      {isFetching && !showInitialLoading && page === 0 && conversations.length === 0 && (
        <LoadingState srLabel="Konuşmalar yükleniyor" />
      )}

      <ConfirmDialog
        open={confirm != null}
        tone="destructive"
        title="Sohbeti sil"
        description={
          confirm
            ? `"${confirm.title}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`
            : undefined
        }
        confirmLabel="Sil"
        busy={del.isPending}
        onConfirm={handleDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
