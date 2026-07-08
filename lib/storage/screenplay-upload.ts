import {
  finalizeScreenplayUploadAction,
  prepareScreenplayUploadAction,
} from "@/app/(app)/series/[id]/screenplay-actions";
import { createClient } from "@/lib/supabase/client";
import { xhrUpload } from "@/lib/storage/xhr-upload";
import type { ScreenplayFormat } from "@/lib/screenplay/types";
import type { UploadProgress } from "@/lib/storage/client-upload";

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

const ACCEPTED_EXTENSIONS = [".pdf", ".fdx", ".fountain", ".txt"];

export function isAcceptedScreenplayFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export async function uploadScreenplayFromClient(
  seriesId: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void,
): Promise<void> {
  if (!isAcceptedScreenplayFile(file)) {
    throw new Error("Upload a .pdf, .fdx, .fountain, or .txt screenplay file.");
  }

  if (file.size > 52_428_800) {
    throw new Error("Screenplay exceeds the 50 MB limit.");
  }

  const report = (percent: number) => {
    onProgress?.({ fileName: file.name, percent });
  };

  report(0);

  const prepare = await prepareScreenplayUploadAction(seriesId, {
    filename: file.name,
    contentType: file.type,
    contentLength: file.size,
  });

  if ("error" in prepare) {
    throw new Error(prepare.error);
  }

  await uploadDirectToStorage(prepare.bucket, prepare.storagePath, file, report);

  const finalize = await finalizeScreenplayUploadAction(seriesId, {
    bucket: prepare.bucket,
    storagePath: prepare.storagePath,
    format: prepare.format as ScreenplayFormat,
    filename: file.name,
  });

  if ("error" in finalize) {
    throw new Error(finalize.error);
  }

  report(100);
}
