import * as React from "react";
import { isRouteErrorResponse, useRouteError, useNavigate } from "react-router-dom";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Beklenmeyen bir hata oluştu.";
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional custom fallback renderer. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * App-level class error boundary with reset. Catches render/runtime errors in
 * the subtree and shows the Phase 1 `ErrorState` fallback instead of a white
 * screen.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // TODO(Phase 13): forward to shared/analytics sink.
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <ErrorState
            className="max-w-md"
            title="Bir şeyler ters gitti"
            description={errorMessage(error)}
            retryLabel="Tekrar dene"
            onRetry={this.reset}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Route-level boundary for React Router `errorElement`. Reads the thrown error
 * via `useRouteError`, distinguishes route error responses (e.g. 404/500), and
 * offers navigation back home plus a reload.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = "Bir şeyler ters gitti";
  let description = errorMessage(error);

  if (isRouteErrorResponse(error)) {
    title = `${error.status} — ${error.statusText}`;
    description =
      typeof error.data === "string" && error.data
        ? error.data
        : "İstenen sayfa yüklenemedi.";
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <ErrorState className="max-w-md" title={title} description={description}>
        <div className="mt-2 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>
            Panele dön
          </Button>
          <Button size="sm" onClick={() => window.location.reload()}>
            Sayfayı yenile
          </Button>
        </div>
      </ErrorState>
    </div>
  );
}
