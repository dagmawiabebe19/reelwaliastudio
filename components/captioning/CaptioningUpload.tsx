"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { uploadCaptioningVideoFromClient } from "@/lib/storage/captioning-upload";
import { Button } from "@/components/ui/Button";

export function CaptioningUpload() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  function handleFile(file: File) {
    setError(null);
    setProgress(0);
    startTransition(async () => {
      try {
        const { jobId } = await uploadCaptioningVideoFromClient(file, {
          onProgress: (p) => setProgress(p.percent),
        });
        router.push(`/captioning/${jobId}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
        setProgress(null);
      }
    });
  }

  return (
    <div className="studio-card p-6">
      <h2 className="font-display text-lg text-foreground">Upload finished episode</h2>
      <p className="mt-2 text-sm text-muted">
        Post-Premiere MP4 of the final cut. We transcribe the{" "}
        <strong className="font-medium text-foreground">actual audio</strong>, not the script.
        Direct upload — large files never pass through the server.
      </p>
      <p className="mt-1 text-xs text-muted">.mp4, .mov, .m4v, .webm, or .mkv · up to 500 MB</p>

      <input
        ref={fileRef}
        type="file"
        accept=".mp4,.mov,.m4v,.webm,.mkv,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
        >
          <span className="inline-flex items-center gap-2">
            <Upload className="h-4 w-4" />
            {pending ? "Uploading…" : "Choose video"}
          </span>
        </Button>
        {progress != null && pending ? (
          <span className="text-sm text-muted">{Math.round(progress)}%</span>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
