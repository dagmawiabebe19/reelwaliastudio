import type { ReactNode } from "react";

interface ComingSoonProps {
  title: string;
  description?: string;
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface px-8 py-16 text-center">
      <p className="font-display text-2xl text-foreground">{title}</p>
      <p className="mt-3 text-sm text-muted">
        {description ?? "Coming soon — this area is under construction."}
      </p>
    </div>
  );
}

interface PlaceholderPageProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export function PlaceholderPage({ title, description, children }: PlaceholderPageProps) {
  return (
    <section>
      <header className="mb-10 border-b border-border pb-8">
        <h1 className="font-display text-4xl font-normal tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-base text-muted">{description}</p>
        ) : null}
      </header>
      {children ?? <ComingSoon title="Coming soon" />}
    </section>
  );
}
