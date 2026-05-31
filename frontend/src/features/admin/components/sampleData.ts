/**
 * SAMPLE (non-real) datasets for admin shells that have no backend endpoint.
 *
 * ⚠️ NONE of this is fetched from the server. No `/users`, `/roles`, or
 * `/audit` endpoint exists. Every consumer labels this data with a SampleBadge.
 * Replace these constants with real query hooks when the endpoints ship — the
 * component props are shaped to be a drop-in match.
 */

export interface SampleUser {
  id: string;
  email: string;
  displayName: string;
  /** Permission strings (matches the JWT perms[] model — NOT roles). */
  perms: string[];
  status: "active" | "invited" | "suspended";
  lastActiveAt: string;
}

export interface SampleRole {
  id: string;
  name: string;
  description: string;
  perms: string[];
  memberCount: number;
}

export interface SampleAuditEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  at: string;
  outcome: "success" | "denied";
}

export const SAMPLE_USERS: SampleUser[] = [
  {
    id: "u_1",
    email: "admin@ornek.com",
    displayName: "Sistem Yöneticisi",
    perms: ["admin:read", "admin:write", "documents:write", "ingestion:write"],
    status: "active",
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: "u_2",
    email: "analist@ornek.com",
    displayName: "Veri Analisti",
    perms: ["documents:read", "rag:read", "search:read"],
    status: "active",
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: "u_3",
    email: "yeni.kullanici@ornek.com",
    displayName: "Davetli Kullanıcı",
    perms: ["documents:read"],
    status: "invited",
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
  {
    id: "u_4",
    email: "askida@ornek.com",
    displayName: "Askıya Alınmış",
    perms: ["documents:read"],
    status: "suspended",
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
  },
];

export const SAMPLE_ROLES: SampleRole[] = [
  {
    id: "r_admin",
    name: "Yönetici",
    description: "Tüm yönetim ve yazma izinleri.",
    perms: ["admin:read", "admin:write", "documents:write", "ingestion:write", "rag:read"],
    memberCount: 1,
  },
  {
    id: "r_editor",
    name: "Editör",
    description: "Belge yükleme ve yönetimi.",
    perms: ["documents:read", "documents:write", "ingestion:write"],
    memberCount: 3,
  },
  {
    id: "r_viewer",
    name: "Görüntüleyici",
    description: "Salt okunur erişim.",
    perms: ["documents:read", "rag:read", "search:read"],
    memberCount: 12,
  },
];

export const SAMPLE_AUDIT: SampleAuditEntry[] = [
  {
    id: "a_1",
    actor: "admin@ornek.com",
    action: "Belge sildi",
    target: "rapor_2026.pdf",
    at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    outcome: "success",
  },
  {
    id: "a_2",
    actor: "analist@ornek.com",
    action: "Yönetim paneline erişim denedi",
    target: "/admin",
    at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    outcome: "denied",
  },
  {
    id: "a_3",
    actor: "admin@ornek.com",
    action: "Kullanıcı davet etti",
    target: "yeni.kullanici@ornek.com",
    at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    outcome: "success",
  },
  {
    id: "a_4",
    actor: "editor@ornek.com",
    action: "İşi yeniden başlattı",
    target: "job_8f2a",
    at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    outcome: "success",
  },
];
