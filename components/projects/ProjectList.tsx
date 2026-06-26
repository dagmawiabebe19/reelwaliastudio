import Link from "next/link";
import type { Project } from "@/lib/db/types";

interface ProjectListProps {
  projects: Project[];
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-8 py-16 text-center">
        <p className="font-display text-2xl text-foreground">No projects yet</p>
        <p className="mt-3 text-sm text-muted">
          Create your first project to start building series.
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
            <span className="text-sm text-muted">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
