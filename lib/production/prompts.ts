import type { AspectRatio } from "@/lib/ai/registry";

export const CHARACTER_HEADSHOT_PREFIX =
  "Clean neutral studio headshot. Plain seamless gray studio background, even soft lighting, neutral expression, front-facing, shoulders visible. No props, no cinematic styling, no dramatic mood, no text, no watermark. Character: ";

export const LOCATION_ESTABLISHING_PREFIX =
  "Clean establishing shot of a location. Neutral daylight, clear composition, no people, no cinematic color grading, no text. Location: ";

export function costumePreviewPrompt(characterName: string, costumeDescription: string): string {
  return (
    `The SAME character as the reference image (${characterName}) wearing: ${costumeDescription}. ` +
    "Clean neutral studio background, even lighting, front-facing headshot, neutral expression. " +
    "Face and identity MUST match the reference exactly — only wardrobe changes. No props, no cinematic styling."
  );
}

export const SHEET_ANGLES = [
  "front",
  "left_profile",
  "right_profile",
  "three_quarter",
  "back",
] as const;

export type SheetAngle = (typeof SHEET_ANGLES)[number];

export const SHEET_ANGLE_LABELS: Record<SheetAngle, string> = {
  front: "Front",
  left_profile: "Left profile",
  right_profile: "Right profile",
  three_quarter: "3/4",
  back: "Back",
};

export function sheetAnglePrompt(angle: SheetAngle, characterName: string, costumeNote: string): string {
  const angleInstruction: Record<SheetAngle, string> = {
    front: "front-facing turnaround view",
    left_profile: "left profile view (subject facing frame left)",
    right_profile: "right profile view (subject facing frame right)",
    three_quarter: "three-quarter view turned slightly from front",
    back: "back view facing away from camera",
  };

  return (
    `Character turnaround sheet — ${angleInstruction[angle]} of ${characterName}. ${costumeNote} ` +
    "Clean neutral seamless studio background, even lighting, consistent wardrobe and face identity across all angles. " +
    "Match the reference images exactly for face and costume. No props, no cinematic styling, no text."
  );
}

export function defaultAspectRatioForIngredients(): AspectRatio {
  return "9:16";
}

/** DoP-friendly camera motion intents for image-to-video. */
export const SHOT_INTENTS = [
  "static",
  "push_in",
  "pull_back",
  "orbit",
  "follow",
  "rise",
  "descend",
] as const;

export type ShotIntent = (typeof SHOT_INTENTS)[number];

export const SHOT_INTENT_LABELS: Record<ShotIntent, string> = {
  static: "Static (locked frame)",
  push_in: "Push in (dolly toward subject)",
  pull_back: "Pull back (dolly away, reveal space)",
  orbit: "Orbit (arc around subject)",
  follow: "Follow (track with subject)",
  rise: "Rise (crane up)",
  descend: "Descend (crane down)",
};

const SHOT_INTENT_CAMERA: Record<ShotIntent, (subjectMotion?: string | null) => string> = {
  static: () => "Camera holds a locked frame.",
  push_in: () => "Camera slowly dollies toward the subject.",
  pull_back: (subjectMotion) =>
    subjectMotion?.trim()
      ? `Camera slowly dollies back as the subject ${subjectMotion.trim()}.`
      : "Camera slowly dollies back as the subject advances toward the lens.",
  orbit: () => "Camera arcs smoothly around the subject.",
  follow: (subjectMotion) =>
    subjectMotion?.trim()
      ? `Camera tracks with the subject as they ${subjectMotion.trim()}.`
      : "Camera tracks with the subject, maintaining consistent framing.",
  rise: () => "Camera cranes upward, revealing more of the scene.",
  descend: () => "Camera cranes downward toward the subject.",
};

export function isShotIntent(value: string | null | undefined): value is ShotIntent {
  return SHOT_INTENTS.includes(value as ShotIntent);
}

export function normalizeShotIntent(value: string | null | undefined): ShotIntent | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  return isShotIntent(normalized) ? normalized : null;
}

const FORWARD_SUBJECT_PATTERNS = [
  /\bwalk(s|ing|ed)?\s+(toward|towards|to|into)\s+(us|camera|viewer|lens)\b/,
  /\b(run|runs|running)\s+(toward|towards|to|into)\s+(us|camera|viewer|lens)\b/,
  /\b(move|moves|moving|step|steps|stride|strides)\s+(toward|towards|to|into)\s+(us|camera|viewer|lens)\b/,
  /\b(approach|approaches|approaching|advance|advances|advancing)\s+(us|camera|the\s+lens|viewer)\b/,
  /\b(come|comes|coming)\s+(toward|towards)\s+(us|camera)\b/,
  /\bwalk(s|ing|ed)?\s+forward\b/,
  /\b(run|runs|running)\s+forward\b/,
  /\bmove(s|ing|ed)?\s+forward\b/,
];

/** Default shot intent from scene prompt — pull_back when subject moves toward camera. */
export function inferDefaultShotIntent(scenePrompt: string): ShotIntent {
  const lower = scenePrompt.toLowerCase();
  if (FORWARD_SUBJECT_PATTERNS.some((pattern) => pattern.test(lower))) {
    return "pull_back";
  }
  return "static";
}

function inferSubjectMotion(scenePrompt: string, shotIntent: ShotIntent): string | null {
  const lower = scenePrompt.toLowerCase();

  if (shotIntent === "pull_back") {
    if (FORWARD_SUBJECT_PATTERNS.some((pattern) => pattern.test(lower))) {
      return "advances toward the lens";
    }
  }

  if (shotIntent === "follow") {
    const match = lower.match(
      /\b(walk|walks|walking|run|runs|running|move|moves|moving|stride|strides|step|steps)\b[^.]{0,50}/,
    );
    if (match) return match[0].trim();
  }

  return null;
}

export function composeVideoPrompt(input: {
  scenePrompt: string;
  shotIntent?: ShotIntent | string | null;
  subjectMotion?: string | null;
}): string {
  const base = input.scenePrompt.trim();
  const intent =
    normalizeShotIntent(input.shotIntent) ?? inferDefaultShotIntent(base);
  const motion = input.subjectMotion ?? inferSubjectMotion(base, intent);
  const cameraClause = SHOT_INTENT_CAMERA[intent](motion);

  if (!base) return cameraClause;
  return `${base} ${cameraClause}`;
}
