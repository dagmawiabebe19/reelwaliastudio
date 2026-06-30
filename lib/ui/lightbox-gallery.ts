import type { LightboxImage } from "@/components/ui/Lightbox";
import { SHEET_ANGLE_LABELS, type SheetAngle } from "@/lib/production/prompts";

export const SHEET_GALLERY_ANGLES: SheetAngle[] = [
  "front",
  "left_profile",
  "right_profile",
  "three_quarter",
  "back",
];

export function buildSheetLightboxGallery(
  angleUrls: Partial<Record<SheetAngle, string | null | undefined>>,
): LightboxImage[] {
  return SHEET_GALLERY_ANGLES.filter((angle) => angleUrls[angle]).map((angle) => ({
    src: angleUrls[angle]!,
    alt: SHEET_ANGLE_LABELS[angle],
    caption: SHEET_ANGLE_LABELS[angle],
  }));
}

export function sheetGalleryIndex(
  angleUrls: Partial<Record<SheetAngle, string | null | undefined>>,
  angle: SheetAngle,
): number {
  const gallery = buildSheetLightboxGallery(angleUrls);
  return Math.max(
    0,
    gallery.findIndex((item) => item.caption === SHEET_ANGLE_LABELS[angle]),
  );
}
