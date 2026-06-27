import type { IngredientKind } from "@/lib/db/types";

const IMAGE_TYPES = /^image\//;
const AUDIO_TYPES = /^audio\//;
const VIDEO_TYPES = /^video\//;

function isImage(type: string) {
  return IMAGE_TYPES.test(type);
}

function isAudio(type: string) {
  return AUDIO_TYPES.test(type);
}

function isVideo(type: string) {
  return VIDEO_TYPES.test(type);
}

export function allowedMimeTypesForKind(kind: IngredientKind): string {
  switch (kind) {
    case "voice":
      return "audio";
    case "reference":
    case "prop":
      return "image, video, or audio";
    default:
      return "image";
  }
}

export function validateIngredientFile(
  file: File,
  kind: IngredientKind,
): { ok: true } | { ok: false; error: string } {
  if (!file.type) {
    return {
      ok: false,
      error: `"${file.name}" has no file type. Expected ${allowedMimeTypesForKind(kind)}.`,
    };
  }

  switch (kind) {
    case "voice":
      if (!isAudio(file.type)) {
        return {
          ok: false,
          error: `"${file.name}" is not audio. Voices accept audio files only.`,
        };
      }
      break;
    case "reference":
    case "prop":
      if (!isImage(file.type) && !isVideo(file.type) && !isAudio(file.type)) {
        return {
          ok: false,
          error: `"${file.name}" is not a supported media type. Reference media accepts images, video, or audio.`,
        };
      }
      break;
    default:
      if (!isImage(file.type)) {
        return {
          ok: false,
          error: `"${file.name}" is not an image. ${kind} ingredients accept images only.`,
        };
      }
      break;
  }

  return { ok: true };
}
