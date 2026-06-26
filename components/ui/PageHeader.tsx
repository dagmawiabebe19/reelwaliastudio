import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-10 border-b border-border pb-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-4xl font-normal tracking-tight text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 max-w-2xl text-base text-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}
