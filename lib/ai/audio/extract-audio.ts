import "server-only";

import { ApiError, fal } from "@fal-ai/client";
import { configureFalClient } from "@/lib/ai/video/seedance-api";

/**
 * fal ffmpeg audio extraction.
 *
 * Some episode exports (e.g. Premiere H.264 + AAC MP4s with a `uuid` box and
 * 64-bit `mdat`) cause Wizper to read NO audio from the muxed video and return
 * an empty transcript. Extracting a bare audio file first — real ffmpeg on
 * fal's compute, never on Vercel — sidesteps every container quirk: Wizper then
 * reliably transcribes the speech.
 *
 * `merge-audios` reads the 0th audio stream of each input (a video's audio
 * track counts) and re-encodes to the chosen format.
 * @see https://fal.ai/models/fal-ai/ffmpeg-api/merge-audios/api
 */
export const AUDIO_EXTRACT_ENDPOINT = "fal-ai/ffmpeg-api/merge-audios";

/** mp3 @ 44.1kHz/64kbps: tiny even for a full episode, plenty for speech. */
const OUTPUT_FORMAT = "mp3_44100_64";

type MergeAudiosOutput = { audio?: { url?: string; content_type?: string } };

/**
 * merge-audios requires >= 2 inputs, so we append a fraction of a second of
 * silence as the second track. Real speech is at the start, so its timecodes
 * are unaffected; the trailing silence carries no cues.
 */
function silentWavBuffer(seconds = 0.2, sampleRate = 16000): Buffer {
  const samples = Math.floor(seconds * sampleRate);
  const dataLen = samples * 2; // 16-bit mono
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  return buf;
}

async function uploadSilencePad(): Promise<string> {
  const wav = silentWavBuffer();
  const file = new File([new Uint8Array(wav)], "silence.wav", { type: "audio/wav" });
  return fal.storage.upload(file);
}

/**
 * Extract an audio-only file from a media URL via fal and return the
 * fal-hosted audio URL (stable, publicly fetchable by Wizper). merge-audios
 * reads the 0th audio stream of the (video) input and re-encodes to mp3.
 */
export async function extractAudioOnFal(input: {
  mediaUrl: string;
  onEnqueue?: (requestId: string) => void | Promise<void>;
}): Promise<string> {
  configureFalClient();

  const silenceUrl = await uploadSilencePad();

  console.log("[audio-extract-submit]", JSON.stringify({ endpoint: AUDIO_EXTRACT_ENDPOINT }));

  const { request_id: requestId } = await fal.queue.submit(AUDIO_EXTRACT_ENDPOINT, {
    input: {
      // Video first so its timeline is the reference; silence pad satisfies the
      // >= 2 inputs requirement without shifting real speech timestamps.
      audio_urls: [input.mediaUrl, silenceUrl],
      output_format: OUTPUT_FORMAT,
    },
  });

  await input.onEnqueue?.(requestId);

  await fal.queue.subscribeToStatus(AUDIO_EXTRACT_ENDPOINT, {
    requestId,
    pollInterval: 3_000,
    logs: false,
  });

  const result = await fal.queue.result(AUDIO_EXTRACT_ENDPOINT, { requestId });
  const data = result.data as MergeAudiosOutput;
  const url = data.audio?.url;
  if (!url) {
    throw new ApiError({
      message: "fal audio extraction completed but returned no audio URL.",
      status: 500,
      body: data,
      requestId,
    });
  }
  return url;
}
