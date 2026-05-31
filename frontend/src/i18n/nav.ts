import {
  LayoutDashboard,
  MessageSquare,
  MessagesSquare,
  FileText,
  Upload,
  Search,
  BarChart3,
  Shield,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Match the route exactly (used for the index route). */
  end?: boolean;
  /** Permission required to *see* this item in the sidebar. */
  perm?: string;
}

/** Primary navigation — Turkish labels centralized here. */
export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Panel", icon: LayoutDashboard, end: true },
  { to: "/chat", label: "Sohbet", icon: MessageSquare },
  { to: "/conversations", label: "Konuşmalar", icon: MessagesSquare },
  { to: "/documents", label: "Belgeler", icon: FileText },
  { to: "/upload", label: "Yükleme", icon: Upload },
  { to: "/search", label: "Arama", icon: Search },
  { to: "/analytics", label: "Analitik", icon: BarChart3 },
  { to: "/admin", label: "Yönetim", icon: Shield, perm: "admin:read" },
  { to: "/settings", label: "Ayarlar", icon: Settings },
];

/**
 * Turkish labels for breadcrumb segments, keyed by the first path segment.
 * Falls back to the raw segment when no entry exists.
 */
export const SEGMENT_LABELS: Record<string, string> = {
  "": "Panel",
  chat: "Sohbet",
  documents: "Belgeler",
  upload: "Yükleme",
  search: "Arama",
  analytics: "Analitik",
  admin: "Yönetim",
  settings: "Ayarlar",
  conversations: "Konuşmalar",
  retrieval: "Getirim",
};

/** App-wide brand name. */
export const BRAND_NAME = "Turkish RAG";
