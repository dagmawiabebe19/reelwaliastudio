import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { CreateProjectForm } from "@/components/projects/CreateProjectForm";

export default function NewProjectPage() {
  return (
    <section>
      <PageHeader
        title="New Project"
        description="Start a new production project for your serialized shows."
        actions={
          <Link
            href="/projects"
            className="link-muted text-sm"
          >
            ← All projects
          </Link>
        }
      />
      <div className="max-w-md rounded-lg border border-border bg-surface p-8">
        <CreateProjectForm />
      </div>
    </section>
  );
}
