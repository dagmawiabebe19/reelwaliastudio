"use client";

import { Download } from "lucide-react";
import { ALL_LANGUAGES, getLanguageLabel } from "@/lib/captioning/languages";
import { SOURCE_LANG } from "@/lib/captioning/types";

interface CaptionExportPanelProps {
  jobId: string;
  title: string;
  hasEnglish: boolean;
  readyLangs: string[];
}

export function CaptionExportPanel({
  jobId,
  title,
  hasEnglish,
  readyLangs,
}: CaptionExportPanelProps) {
  const canExport = hasEnglish || readyLangs.length > 0;

  if (!canExport) {
    return (
      <p className="text-sm text-muted">
        Export becomes available after transcription (or manual English cues) is saved.
      </p>
    );
  }

  return (
    <div className="studio-card p-4">
      <h3 className="font-display text-base text-foreground">Export for ReelWalia platform</h3>
      <p className="mt-2 text-sm text-muted">
        <strong className="text-foreground">Recommended:</strong> download the ZIP of all ready{" "}
        <code className="text-xs">.vtt</code> files and upload each as the episode subtitle on the
        public platform admin. Caption files are tiny text — no large-upload concerns. The Studio
        and public site use separate Supabase projects, so a ZIP handoff is the reliable path.
      </p>

      <a
        href={`/api/captioning/${jobId}/export`}
        className="studio-btn studio-btn-primary mt-4 inline-flex items-center gap-2"
        download={`${title}-captions.zip`}
      >
        <Download className="h-4 w-4" />
        Download all captions (.zip)
      </a>

      <ul className="mt-4 flex flex-wrap gap-2">
        {ALL_LANGUAGES.map((lang) => {
          const ready = lang.code === SOURCE_LANG ? hasEnglish : readyLangs.includes(lang.code);
          if (!ready) return null;
          return (
            <li key={lang.code}>
              <a
                href={`/api/captioning/${jobId}/download?lang=${lang.code}`}
                className="studio-btn studio-btn-secondary text-xs"
              >
                {getLanguageLabel(lang.code)} .vtt
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
