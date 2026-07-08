import { parseFdxContent } from "@/lib/screenplay/parse-fdx";
import { parseFountainContent } from "@/lib/screenplay/parse-fountain";
import { parsePdfContent } from "@/lib/screenplay/parse-pdf";
import type { ScreenplayFormat, ScreenplayParseResult } from "@/lib/screenplay/types";

export async function parseScreenplayBuffer(
  format: ScreenplayFormat,
  buffer: Buffer,
): Promise<ScreenplayParseResult | { error: string }> {
  switch (format) {
    case "fdx":
      return parseFdxContent(buffer);
    case "fountain":
      return parseFountainContent(buffer, "fountain");
    case "txt":
      return parseFountainContent(buffer, "txt");
    case "pdf":
      return parsePdfContent(buffer);
    default:
      return { error: `Unsupported format: ${format}` };
  }
}
