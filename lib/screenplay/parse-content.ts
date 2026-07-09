import { parseFdxContent } from "@/lib/screenplay/parse-fdx";
import { parseFountainContent } from "@/lib/screenplay/parse-fountain";
import type { ParsePdfOptions } from "@/lib/screenplay/parse-pdf";
import type { ScreenplayFormat, ScreenplayParseResult } from "@/lib/screenplay/types";

export type ScreenplayParseOptions = ParsePdfOptions;

export async function parseScreenplayBuffer(
  format: ScreenplayFormat,
  buffer: Buffer,
  options?: ScreenplayParseOptions,
): Promise<ScreenplayParseResult | { error: string }> {
  switch (format) {
    case "fdx":
      return parseFdxContent(buffer);
    case "fountain":
      return parseFountainContent(buffer, "fountain");
    case "txt":
      return parseFountainContent(buffer, "txt");
    case "pdf": {
      const { parsePdfContent } = await import("@/lib/screenplay/parse-pdf");
      return parsePdfContent(buffer, options);
    }
    default:
      return { error: `Unsupported format: ${format}` };
  }
}
