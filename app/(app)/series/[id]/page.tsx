import { notFound } from "next/navigation";
import { OrientationToggle } from "@/components/series/OrientationToggle";
import { SeriesBriefEditor } from "@/components/series/SeriesBriefEditor";
import { StatTiles } from "@/components/series/StatTiles";
import { StatusDot, type StatusVariant } from "@/components/ui/StatusDot";
import { getSeries, getSeriesStats } from "@/lib/db/series";
import type { SeriesStatus } from "@/lib/db/types";

interface SeriesPageProps {
  params: Promise<{ id: string }>;
}

const statusLabels: Record<SeriesStatus, string> = {
  in_progress: "In progress",
  validated: "Validated",
  released: "Released",
};

function seriesStatusVariant(status: SeriesStatus): StatusVariant {
  return status;
}

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { id } = await params;
  const [series, stats] = await Promise.all([getSeries(id), getSeriesStats(id)]);

  if (!series) notFound();

  return (
    <section className="space-y-12">
      <header className="border-b border-border pb-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-4">
            <StatusDot
              variant={seriesStatusVariant(series.status)}
              label={statusLabels[series.status]}
            />
            <h1 className="font-display text-4xl font-normal tracking-tight text-foreground">
              {series.title}
            </h1>
            <p className="font-mono text-sm text-muted">/{series.slug}</p>
          </div>
          <OrientationToggle seriesId={series.id} value={series.default_orientation} />
        </div>
        <div className="mt-10">
          <StatTiles
            episodeCount={stats.episodeCount}
            ingredientCount={stats.ingredientCount}
            runtimeSeconds={stats.runtimeSeconds}
          />
        </div>
      </header>

      <SeriesBriefEditor seriesId={series.id} initialMarkdown={series.brief_markdown} />
    </section>
  );
}
