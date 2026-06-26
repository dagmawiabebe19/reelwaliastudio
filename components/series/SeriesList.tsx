import Link from "next/link";
import { StatusDot, type StatusVariant } from "@/components/ui/StatusDot";
import { orientationLabel } from "@/components/series/StatTiles";
import type { Series, SeriesStatus } from "@/lib/db/types";

interface SeriesListProps {
  series: Series[];
  emptyMessage?: string;
}

const statusLabels: Record<SeriesStatus, string> = {
  in_progress: "In progress",
  validated: "Validated",
  released: "Released",
};

function statusVariant(status: SeriesStatus): StatusVariant {
  return status;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function SeriesList({ series, emptyMessage }: SeriesListProps) {
  if (series.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-8 py-16 text-center">
        <p className="font-display text-2xl text-foreground">No series yet</p>
        <p className="mt-3 text-sm text-muted">
          {emptyMessage ?? "Create a series to start building episodes and scenes."}
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {series.map((item) => (
        <li key={item.id}>
          <Link
            href={`/series/${item.id}`}
            className="flex items-center justify-between gap-6 px-6 py-5 transition-colors hover:bg-surface-elevated"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-base font-medium text-foreground">{item.title}</p>
                <StatusDot variant={statusVariant(item.status)} label={statusLabels[item.status]} />
              </div>
              <p className="mt-1 font-mono text-xs text-muted">/{item.slug}</p>
              <p className="mt-2 text-xs text-muted">
                {orientationLabel(item.default_orientation)} · Updated {formatDate(item.updated_at)}
              </p>
            </div>
            <span className="shrink-0 text-sm text-muted">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
