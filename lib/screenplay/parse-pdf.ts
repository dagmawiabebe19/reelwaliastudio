import { extractPdfText } from "@/lib/screenplay/pdf-extract-text";
import { structureScreenplayText } from "@/lib/screenplay/structure";
import type { ScreenplayParseResult } from "@/lib/screenplay/types";

export type PdfParsePhase = "reading" | "structuring";

export type ParsePdfOptions = {
  onPhase?: (phase: PdfParsePhase) => void | Promise<void>;
};

export async function parsePdfContent(
  buffer: Buffer,
  options?: ParsePdfOptions,
): Promise<ScreenplayParseResult | { error: string }> {
  await options?.onPhase?.("reading");

  const extracted = await extractPdfText(buffer);
  if ("error" in extracted) {
    return extracted;
  }

  await options?.onPhase?.("structuring");

  const structured = structureScreenplayText(extracted.text, extracted.pageCountEst);
  if ("error" in structured) return structured;

  console.log("[screenplay-pdf] parsed screenplay from PDF", {
    method: extracted.method,
    sceneCount: structured.scenes.length,
    characterCount: structured.characterNames.length,
    locationCount: structured.locationNames.length,
  });

  return structured;
}
