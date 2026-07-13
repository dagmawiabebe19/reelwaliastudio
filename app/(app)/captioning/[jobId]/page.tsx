import Link from "next/link";
import { notFound } from "next/navigation";
import { BurnInPanel } from "@/components/captioning/BurnInPanel";
import { LanguageBurnExportPanel } from "@/components/captioning/LanguageBurnExportPanel";
import { CaptionExportPanel } from "@/components/captioning/CaptionExportPanel";
import { CaptionReviewPanel } from "@/components/captioning/CaptionReviewPanel";
import { CaptionJobPoller } from "@/components/captioning/CaptionJobPoller";
import { TranslationPanel } from "@/components/captioning/TranslationPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { getBurnInStyle } from "@/lib/captioning/burn-style";
import {
  estimateBurnInCredits,
  estimateTranscriptionCredits,
} from "@/lib/credits/pricing";
import {
  getCaptioningJob,
  listCues,
  listTranslations,
} from "@/lib/db/captioning";
import { listBurnedExportsForJob } from "@/lib/db/caption-burns";
import { SOURCE_LANG } from "@/lib/captioning/types";

interface CaptionJobPageProps {
  params: Promise<{ jobId: string }>;
}

export default async function CaptionJobPage({ params }: CaptionJobPageProps) {
  const { jobId } = await params;
  const job = await getCaptioningJob(jobId);
  if (!job) notFound();

  const [englishCues, translations, burnedExports] = await Promise.all([
    listCues(jobId, SOURCE_LANG),
    listTranslations(jobId),
    listBurnedExportsForJob(jobId).catch(() => [] as Awaited<ReturnType<typeof listBurnedExportsForJob>>),
  ]);

  const readyLangs = translations.filter((t) => t.status === "ready").map((t) => t.lang);
  const isPending =
    job.status === "transcribing" ||
    job.status === "uploaded" ||
    job.status === "translating" ||
    job.burn_status === "processing" ||
    translations.some((t) => t.status === "translating" || t.status === "pending") ||
    burnedExports.some((row) => row.status === "queued" || row.status === "rendering");

  const durationSec = job.duration_seconds ? Number(job.duration_seconds) : 90;
  const transcribeCredits = estimateTranscriptionCredits(durationSec);
  const burnStyle = getBurnInStyle();
  const burnInCredits = estimateBurnInCredits(durationSec, burnStyle.preset);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <CaptionJobPoller active={isPending} />

      <PageHeader
        title={job.title}
        description={`Captioning job · ${job.status.replace(/_/g, " ")}`}
        actions={
          <Link href="/captioning" className="studio-btn studio-btn-secondary text-sm">
            ← All jobs
          </Link>
        }
      />

      <div className="mb-8 rounded-lg border border-border bg-surface-elevated px-4 py-3 text-sm text-muted">
        <p>
          <strong className="text-foreground">Transcription:</strong> fal Wizper (Whisper v3) ·
          runs on fal compute, reads the episode directly — no size/extraction limits ·
          this job ≈ {transcribeCredits} credits
          {job.duration_seconds ? ` (${Math.ceil(durationSec / 60)} min billed)` : ""}.
        </p>
        <p className="mt-1">
          Music-only or heavy SFX clips may return few cues — add lines manually before approving.
        </p>
      </div>

      <section className="space-y-8">
        <CaptionReviewPanel job={job} initialCues={englishCues} />
        <TranslationPanel
          jobId={job.id}
          englishApproved={!!job.english_approved_at}
          translations={translations}
        />
        <CaptionExportPanel
          jobId={job.id}
          title={job.title}
          hasEnglish={englishCues.length > 0}
          readyLangs={readyLangs}
        />
        <BurnInPanel
          jobId={job.id}
          englishApproved={!!job.english_approved_at}
          burnStatus={job.burn_status}
          burnFailReason={job.burn_fail_reason}
          hasBurnedVideo={!!job.burned_video_path}
          estimateCredits={burnInCredits}
          preset={burnStyle.preset}
          position={burnStyle.position}
        />
        <LanguageBurnExportPanel
          jobId={job.id}
          englishApproved={!!job.english_approved_at}
          readyLangs={readyLangs}
          exports={burnedExports}
          perLangCredits={burnInCredits}
          preset={burnStyle.preset}
        />
      </section>
    </div>
  );
}
