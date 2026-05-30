import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const setTokens = useAuth((s) => s.setTokens);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setTokens(data.access_token, data.refresh_token);
      navigate("/");
    } catch {
      setError("Giriş başarısız. Bilgilerinizi kontrol edin.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-border p-6">
        <h1 className="text-xl font-semibold tracking-tight">Turkish RAG'e giriş</h1>
        <input
          type="email" placeholder="E-posta" value={email} required
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
        />
        <input
          type="password" placeholder="Parola" value={password} required
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit" disabled={loading}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Giriş yapılıyor…" : "Giriş yap"}
        </button>
      </form>
    </div>
  );
}
