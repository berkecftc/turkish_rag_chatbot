import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/stores/auth";
import { normalizeError } from "@/shared/lib/normalizeError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLogin } from "@/features/auth/api";

/**
 * Register is NOT mounted on the backend (`/auth/register` does not exist).
 * Keep any real register form gated behind this flag; until then we only ever
 * show a static "contact admin" info state. Do not fake a success path.
 */
const REGISTER_ENABLED = false;

interface LocationState {
  from?: { pathname?: string };
}

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "E-posta adresi gereklidir.")
    .email("Geçerli bir e-posta adresi girin."),
  password: z.string().min(1, "Parola gereklidir."),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setTokens = useAuth((s) => s.setTokens);
  const loginMutation = useLogin();
  const [formError, setFormError] = useState<string | null>(null);
  const [showRegisterInfo, setShowRegisterInfo] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const from = (location.state as LocationState | null)?.from?.pathname ?? "/";

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    loginMutation.mutate(values, {
      onSuccess: (tokens) => {
        setTokens(tokens.access_token, tokens.refresh_token);
        navigate(from, { replace: true });
      },
      onError: (err) => {
        setFormError(normalizeError(err).message);
      },
    });
  });

  const submitting = loginMutation.isPending;
  const emailErr = errors.email?.message;
  const passwordErr = errors.password?.message;

  return (
    <div className="w-full max-w-sm space-y-6">
      <form
        onSubmit={onSubmit}
        noValidate
        className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Hesabınıza giriş yapın
          </h1>
          <p className="text-sm text-muted-foreground">
            Devam etmek için e-posta ve parolanızı girin.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            E-posta
          </label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            placeholder="ornek@sirket.com"
            autoComplete="email"
            autoFocus
            aria-invalid={emailErr ? true : undefined}
            aria-describedby={emailErr ? "email-error" : undefined}
            {...register("email")}
          />
          {emailErr && (
            <p id="email-error" role="alert" className="text-sm text-destructive">
              {emailErr}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Parola
          </label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            aria-invalid={passwordErr ? true : undefined}
            aria-describedby={passwordErr ? "password-error" : undefined}
            {...register("password")}
          />
          {passwordErr && (
            <p id="password-error" role="alert" className="text-sm text-destructive">
              {passwordErr}
            </p>
          )}
        </div>

        {formError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </div>
        )}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {submitting ? "Giriş yapılıyor…" : "Giriş yap"}
        </Button>
      </form>

      <div className="text-center text-sm text-muted-foreground">
        <span>Hesabınız yok mu? </span>
        <button
          type="button"
          onClick={() => setShowRegisterInfo((v) => !v)}
          className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          aria-expanded={showRegisterInfo}
        >
          Kayıt
        </button>
      </div>

      {showRegisterInfo && (
        <div
          role="note"
          className="rounded-md border border-border bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground"
        >
          {REGISTER_ENABLED
            ? "Kayıt formu yakında kullanıma açılacaktır."
            : "Yeni hesap oluşturmak için lütfen sistem yöneticiniz ile iletişime geçin."}
        </div>
      )}
    </div>
  );
}
