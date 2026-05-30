import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LocationState {
  from?: { pathname?: string };
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setTokens = useAuth((s) => s.setTokens);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from = (location.state as LocationState | null)?.from?.pathname ?? "/";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setTokens(data.access_token, data.refresh_token);
      navigate(from, { replace: true });
    } catch {
      setError("Giriş başarısız. Bilgilerinizi kontrol edin.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
    >
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Turkish RAG'e giriş
        </h1>
        <p className="text-sm text-muted-foreground">Hesabınıza giriş yapın.</p>
      </div>
      <Input
        type="email"
        placeholder="E-posta"
        value={email}
        required
        autoComplete="email"
        onChange={(e) => setEmail(e.target.value)}
      />
      <Input
        type="password"
        placeholder="Parola"
        value={password}
        required
        autoComplete="current-password"
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Giriş yapılıyor…" : "Giriş yap"}
      </Button>
    </form>
  );
}
