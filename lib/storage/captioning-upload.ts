import {
  finalizeCaptioningUploadAction,
  prepareCaptioningUploadAction,
} from "@/app/(app)/captioning/actions";
import { createClient } from "@/lib/supabase/client";
import { xhrUpload } from "@/lib/storage/xhr-upload";

export type UploadProgress = { fileName: string; percent: number };

async function uploadDirectToStorage(
  bucket: string,
  storagePath: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated. Sign in to upload files.");
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");

  const encodedPath = storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const url = `${baseUrl}/storage/v1/object/${bucket}/${encodedPath}`;

  await xhrUpload(
    url,
    "POST",
    file,
    {
      Authorization: `Bearer ${session.access_token}`,
      "x-upsert": "false",
      "Content-Type": file.type || "application/octet-stream",
    },
    onProgress,
  );
}

/** Read duration from a local video file (browser metadata). */
function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}

export async function uploadCaptioningVideoFromClient(
  file: File,
  options?: { episodeId?: string | null; onProgress?: (p: UploadProgress) => void },
): Promise<{ jobId: string }> {
  const report = (percent: number) => {
    options?.onProgress?.({ fileName: file.name, percent });
  };

  report(0);

  const prepare = await prepareCaptioningUploadAction({
    filename: file.name,
    contentType: file.type,
    contentLength: file.size,
  });

  if ("error" in prepare) {
    throw new Error(prepare.error);
  }

  await uploadDirectToStorage(prepare.bucket, prepare.storagePath, file, report);

  const durationSeconds = await readVideoDuration(file);

  const finalize = await finalizeCaptioningUploadAction({
    bucket: prepare.bucket,
    storagePath: prepare.storagePath,
    filename: file.name,
    durationSeconds,
    episodeId: options?.episodeId ?? null,
  });

  if ("error" in finalize) {
    throw new Error(finalize.error);
  }

  report(100);
  return { jobId: finalize.jobId };
}
