import Link from "next/link";
import { ChevronRight, FolderOpen } from "lucide-react";
import { OnboardingGuide, OnboardingPrimaryLink } from "@/components/onboarding/OnboardingGuide";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import type { Project } from "@/lib/db/types";

interface ProjectListProps {
  projects: Project[];
  showOnboarding?: boolean;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function ProjectList({ projects, showOnboarding = false }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="space-y-6">
        {showOnboarding ? (
          <OnboardingGuide
            phase="create-project"
            primaryAction={
              <OnboardingPrimaryLink href="/projects/new">Create your first project</OnboardingPrimaryLink>
            }
          />
        ) : null}
        <EmptyState
        variant="list"
        icon={FolderOpen}
        title="No projects yet"
        description="Create your first project to start building series."
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
      {projects.map((project) => (
        <li key={project.id}>
          <Link
            href={`/projects/${project.id}`}
            className="flex items-center justify-between px-6 py-5 transition-colors hover:bg-surface-elevated"
          >
            <div>
              <p className="text-base font-medium text-foreground">{project.name}</p>
              <p className="mt-1 text-xs text-muted">Updated {formatDate(project.updated_at)}</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
