import "server-only";

import type { GenerateVideoInput, GenerationResult, VideoAdapter } from "./types";

const notImplemented: VideoAdapter = async () => {
  throw new Error("seedance adapter: not implemented — TODO wire Seedance API");
};

export const generateVideo: VideoAdapter = notImplemented;

export async function runSeedance(input: GenerateVideoInput): Promise<GenerationResult> {
  void process.env.FAL_KEY;
  return generateVideo(input);
}
