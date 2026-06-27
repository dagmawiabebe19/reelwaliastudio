import "server-only";

import JSZip from "jszip";
import { listStarredTakesByScene } from "@/lib/db/takes";
import { getScene } from "@/lib/db/scenes";
import { getStorageClient } from "@/lib/storage/client";

export async function buildSceneStarredTakesZip(sceneId: string): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const scene = await getScene(sceneId);
  if (!scene) throw new Error("Scene not found.");

  const takes = await listStarredTakesByScene(sceneId);
  if (!takes.length) throw new Error("No starred takes for this scene.");

  const zip = new JSZip();
  const supabase = await getStorageClient();

  for (const take of takes) {
    if (!take.assets) continue;
    const { data, error } = await supabase.storage
      .from(take.assets.bucket)
      .download(take.assets.storage_path);
    if (error || !data) continue;

    const ext = take.assets.storage_path.split(".").pop() ?? "bin";
    zip.file(`take-${take.take_number}.${ext}`, Buffer.from(await data.arrayBuffer()));
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const safeTitle = scene.title.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
  return { buffer, filename: `${safeTitle}-starred-takes.zip` };
}
