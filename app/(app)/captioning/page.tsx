import Link from "next/link";
import { CaptioningUpload } from "@/components/captioning/CaptioningUpload";
import { PageHeader } from "@/components/ui/PageHeader";
import { listCaptioningJobs } from "@/lib/db/captioning";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  transcribing: "Transcribing…",
  transcribed: "Review English",
  translating: "Translating…",
  ready: "Ready",
  failed: "Failed",
};

export default async function CaptioningPage() {
  const jobs = await listCaptioningJobs();

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <PageHeader
        title="Captioning"
        description="Upload a finished episode, transcribe the real audio, review English, translate to 12 languages, and export WebVTT for the ReelWalia platform."
      />

      <CaptioningUpload />

      <section className="mt-10">
        <h2 className="font-display text-lg text-foreground">Recent jobs</h2>
        {jobs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No captioning jobs yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/captioning/${job.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-surface-elevated"
                >
                  <div>
                    <p className="font-medium text-foreground">{job.title}</p>
                    <p className="text-xs text-muted">
                      {new Date(job.created_at).toLocaleString()}
                      {job.duration_seconds
                        ? ` · ${Math.ceil(Number(job.duration_seconds) / 60)} min`
                        : ""}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-accent">
                    {STATUS_LABEL[job.status] ?? job.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
