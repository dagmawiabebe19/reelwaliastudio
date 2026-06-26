import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="rounded-lg border border-border bg-surface p-10 shadow-sm">
      <header className="mb-8 text-center">
        <h1 className="font-display text-3xl text-foreground">ReelWalia Studio</h1>
        <p className="mt-2 text-sm text-muted">Sign in with a magic link</p>
      </header>
      <LoginForm />
    </div>
  );
}
