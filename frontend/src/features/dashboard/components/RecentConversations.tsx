/**
 * Recent conversations panel (top 5 from /rag/conversations).
 * Clicking a row navigates to /chat/:id.
 */

import { Link } from "react-router-dom";
import { MessagesSquare, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ListSkeleton } from "@/components/Skeletons";
import { formatNumber, formatRelativeTime } from "@/shared/lib/format";
import type { ConversationOut } from "@/shared/types/api";

const MAX_ROWS = 5;

export interface RecentConversationsProps {
  conversations: ConversationOut[] | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

export function RecentConversations({
  conversations,
  loading,
  error,
  onRetry,
}: RecentConversationsProps) {
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessagesSquare className="size-4 text-muted-foreground" aria-hidden="true" />
          Son sohbetler
        </h2>
        <Link
          to="/chat"
          className="text-xs font-medium text-primary hover:underline"
        >
          Tümü
        </Link>
      </div>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorState
          title="Sohbetler yüklenemedi"
          description="Sohbet geçmişi alınırken bir sorun oluştu."
          retryLabel="Yeniden dene"
          onRetry={onRetry}
        />
      ) : !conversations || conversations.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare aria-hidden="true" />}
          title="Henüz sohbet yok"
          description="İlk sohbetinizi başlatarak belgelerinizle konuşmaya başlayın."
        />
      ) : (
        <ul className="space-y-1">
          {conversations.slice(0, MAX_ROWS).map((c) => (
            <li key={c.id}>
              <Link
                to={`/chat/${c.id}`}
                className="group flex items-center gap-3 rounded-md p-2.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {c.title?.trim() || "Başlıksız sohbet"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {formatNumber(c.total_messages)} mesaj
                    {c.last_message_at
                      ? ` · ${formatRelativeTime(c.last_message_at)}`
                      : ` · ${formatRelativeTime(c.created_at)}`}
                  </p>
                </div>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
