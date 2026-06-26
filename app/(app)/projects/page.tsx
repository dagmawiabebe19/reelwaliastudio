import { PageHeader } from "@/components/ui/PageHeader";
import { CreateProjectForm } from "@/components/projects/CreateProjectForm";
import { ProjectList } from "@/components/projects/ProjectList";
import { listProjects } from "@/lib/db/projects";

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <section>
      <PageHeader
        title="Projects"
        description="Organize your shows and production pipelines."
      />
      <div className="mb-10">
        <CreateProjectForm />
      </div>
      <ProjectList projects={projects} />
    </section>
  );
}
