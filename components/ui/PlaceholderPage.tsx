import type { ReactNode } from "react";
import { Construction } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

interface ComingSoonProps {
  title: string;
  description?: string;
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <EmptyState
      variant="list"
      icon={Construction}
      title={title}
      description={description ?? "Coming soon — this area is under construction."}
    />
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
