import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const authError =
    error === "auth"
      ? "Sign-in link expired or invalid. Request a new magic link below."
      : null;

  return (
    <div className="rounded-lg border border-border bg-surface p-10 shadow-sm">
      <header className="mb-8 text-center">
        <h1 className="brand-wordmark font-display text-3xl font-bold tracking-tight">
          <span className="text-foreground">Reel</span>
          <span className="text-accent">Walia</span>
        </h1>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Studio
        </p>
        <p className="mt-4 text-sm text-muted">Sign in with a magic link</p>
      </header>
      {authError ? (
        <p
          role="alert"
          className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
        >
          {authError}
        </p>
      ) : null}
      <LoginForm />
    </div>
  );
}
