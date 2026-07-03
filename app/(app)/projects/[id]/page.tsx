import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { CollapsibleCreateSeriesForm } from "@/components/series/CollapsibleCreateSeriesForm";
import { SeriesList } from "@/components/series/SeriesList";
import { PageHeader } from "@/components/ui/PageHeader";
import { getActiveUserId } from "@/lib/auth/getUser";
import { getProject } from "@/lib/db/projects";
import { listSeriesByProject } from "@/lib/db/series";
import { shouldShowOnboarding } from "@/lib/onboarding/status";

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { id } = await params;
  const userId = await getActiveUserId();
  const [project, series] = await Promise.all([getProject(id), listSeriesByProject(id)]);

  if (!project) notFound();

  const showOnboarding =
    series.length === 0 && (await shouldShowOnboarding(userId, "create-series"));

  return (
    <section>
      <PageHeader
        title={project.name}
        description="Series in this project — portrait 9:16 and landscape 16:9."
        actions={
          <Link
            href="/projects"
            className="link-muted inline-flex items-center gap-1 text-sm"
          >
            <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden />
            All projects
          </Link>
        }
      />
      <SeriesList series={series} showOnboarding={showOnboarding} />
      <div className="mt-8 border-t border-border pt-8">
        <CollapsibleCreateSeriesForm
          projectId={project.id}
          defaultExpanded={showOnboarding}
        />
      </div>
    </section>
  );
}
