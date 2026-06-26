import "server-only";

import type { GenerateVideoInput, GenerationResult, VideoAdapter } from "./types";

const notImplemented: VideoAdapter = async () => {
  throw new Error("higgsfield adapter: not implemented — TODO wire Higgsfield API");
};

export const generateVideo: VideoAdapter = notImplemented;

export async function runHiggsfield(input: GenerateVideoInput): Promise<GenerationResult> {
  void process.env.HIGGSFIELD_API_KEY;
  return generateVideo(input);
}
