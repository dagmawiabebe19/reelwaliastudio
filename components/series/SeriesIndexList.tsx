import Link from "next/link";
import { ChevronRight, Film } from "lucide-react";
import { OnboardingGuide, OnboardingPrimaryLink } from "@/components/onboarding/OnboardingGuide";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { StatusDot, type StatusVariant } from "@/components/ui/StatusDot";
import { orientationLabel } from "@/components/series/StatTiles";
import type { SeriesWithProject } from "@/lib/db/series";
import type { SeriesStatus } from "@/lib/db/types";
import type { OnboardingPhase } from "@/lib/onboarding/constants";

interface SeriesIndexListProps {
  series: SeriesWithProject[];
  onboardingPhase?: OnboardingPhase | null;
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

export function SeriesIndexList({ series, onboardingPhase = null }: SeriesIndexListProps) {
  if (series.length === 0) {
    const primaryHref =
      onboardingPhase === "create-project" ? "/projects/new" : "/projects";
    const primaryLabel =
      onboardingPhase === "create-project" ? "Create your first project" : "Open projects";

    return (
      <div className="space-y-6">
        {onboardingPhase ? (
          <OnboardingGuide
            phase={onboardingPhase}
            primaryAction={
              <OnboardingPrimaryLink href={primaryHref}>{primaryLabel}</OnboardingPrimaryLink>
            }
          />
        ) : null}
        <EmptyState
        variant="list"
        icon={Film}
        title="No series yet"
        description="Create a project, then add a series to get started."
        action={
          <Link href="/projects/new">
            <Button type="button">New project</Button>
          </Link>
        }
        />
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
            <ChevronRight className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
