import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProjectList } from "@/components/projects/ProjectList";
import { getActiveUserId } from "@/lib/auth/getUser";
import { listProjects } from "@/lib/db/projects";
import { shouldShowOnboarding } from "@/lib/onboarding/status";

export default async function ProjectsPage() {
  const userId = await getActiveUserId();
  const projects = await listProjects();
  const showOnboarding = await shouldShowOnboarding(userId, "create-project");

  return (
    <section>
      <PageHeader
        title="Projects"
        description="Organize projects — each project contains one or more series."
        actions={
          <Link
            href="/projects/new"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            New project
          </Link>
        }
      />
      <ProjectList projects={projects} showOnboarding={showOnboarding} />
    </section>
  );
}
