import {
  finalizeIngredientUploadAction,
  prepareIngredientUploadAction,
} from "@/app/(app)/series/[id]/actions";
import { createClient } from "@/lib/supabase/client";
import type { IngredientKind } from "@/lib/db/types";
import { readImageDimensions } from "@/lib/storage/media-meta";
import { validateIngredientFile } from "@/lib/storage/validate";
import { xhrUpload } from "@/lib/storage/xhr-upload";

export type UploadProgress = {
  fileName: string;
  percent: number;
};

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

async function uploadViaSignedUrl(
  signedUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  await xhrUpload(
    signedUrl,
    "PUT",
    file,
    { "Content-Type": file.type || "application/octet-stream" },
    onProgress,
  );
}

export async function uploadIngredientFromClient(
  seriesId: string,
  file: File,
  kind: IngredientKind,
  onProgress?: (progress: UploadProgress) => void,
): Promise<void> {
  const validation = validateIngredientFile(file, kind);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const report = (percent: number) => {
    onProgress?.({ fileName: file.name, percent });
  };

  report(0);

  const prepare = await prepareIngredientUploadAction(seriesId, {
    kind,
    filename: file.name,
    contentType: file.type,
    contentLength: file.size,
  });

  if ("error" in prepare) {
    throw new Error(prepare.error);
  }

  if (prepare.uploadMethod === "signed") {
    if (!prepare.signedUrl) {
      throw new Error("Signed upload URL was not provided.");
    }
    await uploadViaSignedUrl(prepare.signedUrl, file, report);
  } else {
    await uploadDirectToStorage(prepare.bucket, prepare.storagePath, file, report);
  }

  const dimensions = await readImageDimensions(file);

  const finalize = await finalizeIngredientUploadAction(seriesId, {
    kind,
    bucket: prepare.bucket,
    storagePath: prepare.storagePath,
    name: file.name.replace(/\.[^.]+$/, ""),
    contentType: file.type,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
  });

  if ("error" in finalize) {
    throw new Error(finalize.error);
  }

  report(100);
}
