import Link from "next/link";

interface SeriesLoadErrorProps {
  seriesId: string;
  title?: string | null;
}

export function SeriesLoadError({ seriesId, title }: SeriesLoadErrorProps) {
  return (
    <section className="mx-auto max-w-2xl space-y-6 py-16 text-center">
      <h1 className="font-display text-3xl text-foreground">
        {title ? title : "Could not load series"}
      </h1>
      <p className="text-sm text-muted">
        Something went wrong loading this project. Your episodes and ingredients are still saved —
        try refreshing, or head back and open the series again.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href={`/series/${seriesId}`}
          className="rounded-md border border-accent/40 px-4 py-2 text-sm text-accent hover:bg-accent/10"
        >
          Refresh
        </Link>
        <Link
          href="/projects"
          className="rounded-md border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Back to projects
        </Link>
      </div>
    </section>
  );
}
