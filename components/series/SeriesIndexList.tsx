import Link from "next/link";
import { StatusDot, type StatusVariant } from "@/components/ui/StatusDot";
import { orientationLabel } from "@/components/series/StatTiles";
import type { SeriesWithProject } from "@/lib/db/series";
import type { SeriesStatus } from "@/lib/db/types";

interface SeriesIndexListProps {
  series: SeriesWithProject[];
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

export function SeriesIndexList({ series }: SeriesIndexListProps) {
  if (series.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-8 py-16 text-center">
        <p className="font-display text-2xl text-foreground">No series yet</p>
        <p className="mt-3 text-sm text-muted">
          Create a project, then add a series to get started.
        </p>
        <Link
          href="/projects/new"
          className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          New project
        </Link>
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
                {item.projects?.name ?? "Unknown project"} ·{" "}
                {orientationLabel(item.default_orientation)} · Updated{" "}
                {formatDate(item.updated_at)}
              </p>
            </div>
            <span className="shrink-0 text-sm text-muted">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
