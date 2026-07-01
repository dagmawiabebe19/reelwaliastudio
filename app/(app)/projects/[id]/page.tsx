import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { CreateSeriesForm } from "@/components/series/CreateSeriesForm";
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
      <div className="mb-10 grid grid-cols-2 gap-8">
        <CreateSeriesForm projectId={project.id} />
        <div className="rounded-lg border border-border bg-surface px-6 py-5">
          <p className="text-xs uppercase tracking-widest text-muted">Series count</p>
          <p className="mt-2 font-display text-4xl text-foreground">{series.length}</p>
        </div>
      </div>
      <SeriesList series={series} showOnboarding={showOnboarding} />
    </section>
  );
}
