"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteAudioLineAction,
  getAudioLineDeletePreviewAction,
} from "@/app/(app)/series/[id]/delete-actions";
import {
  getAudioDownloadUrlAction,
  uploadAudioLineAction,
} from "@/app/(app)/series/[id]/episodes/[episodeId]/actions";
import { DeleteConfirmButton } from "@/components/ui/DeleteConfirmButton";
import { RefTag } from "@/components/ui/RefTag";
import { MediaPlayer } from "@/components/ui/MediaPlayer";
import { Button } from "@/components/ui/Button";

export type AudioLineCardData = {
  id: string;
  title: string;
  description: string | null;
  ref_tag: string;
  assetUrl: string | null;
  assetId: string | null;
};

interface AudioLinesPanelProps {
  seriesId: string;
  episodeId: string;
  lines: AudioLineCardData[];
}

export function AudioLinesPanel({ seriesId, episodeId, lines }: AudioLinesPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  function handleUpload(formData: FormData) {
    startTransition(async () => {
      const result = await uploadAudioLineAction(episodeId, seriesId, formData);
      if (result.error) alert(result.error);
      else router.refresh();
    });
  }

  function handleDownload(line: AudioLineCardData) {
    if (!line.assetId) return;
    startTransition(async () => {
      const result = await getAudioDownloadUrlAction(episodeId, line.assetId!);
      if (result.url) window.open(result.url, "_blank");
      else if (result.error) alert(result.error);
      setOpenMenuId(null);
    });
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <h2 className="font-display text-xl text-foreground">Audio Lines</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleUpload(new FormData(e.currentTarget));
        }}
        className="grid gap-3 md:grid-cols-4"
      >
        <input
          name="title"
          required
          placeholder="Line title"
          className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm"
        />
        <input
          name="description"
          placeholder="Description"
          className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm"
        />
        <input name="file" type="file" accept="audio/*" required className="text-sm" />
        <Button type="submit" disabled={pending}>
          Add line
        </Button>
      </form>

      <ul className="divide-y divide-border">
        {lines.length === 0 ? (
          <li className="py-6 text-sm text-muted">No audio lines yet.</li>
        ) : (
          lines.map((line) => (
            <li key={line.id} className="flex flex-wrap items-center gap-4 py-4">
              <div className="min-w-[10rem] flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{line.title}</p>
                  <RefTag tag={line.ref_tag} />
                </div>
                {line.description ? (
                  <p className="mt-1 text-xs text-muted">{line.description}</p>
                ) : null}
              </div>
              <div className="w-48">
                <MediaPlayer src={line.assetUrl} />
              </div>
              <div className="relative flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpenMenuId(openMenuId === line.id ? null : line.id)}
                >
                  ⋯
                </Button>
                <DeleteConfirmButton
                  ariaLabel="Delete audio line"
                  fetchPreview={() =>
                    getAudioLineDeletePreviewAction(line.id, episodeId, seriesId)
                  }
                  onDelete={() => deleteAudioLineAction(line.id, episodeId, seriesId)}
                  onSuccess={() => router.refresh()}
                />
                {openMenuId === line.id ? (
                  <div className="absolute right-0 z-10 mt-1 w-36 rounded-md border border-border bg-surface-elevated py-1 shadow-lg">
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-accent-muted"
                      onClick={() => handleDownload(line)}
                    >
                      Download
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
