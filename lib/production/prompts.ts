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
