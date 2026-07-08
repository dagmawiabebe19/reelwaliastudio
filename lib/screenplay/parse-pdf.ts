import { PDFParse } from "pdf-parse";
import { structureScreenplayText } from "@/lib/screenplay/structure";
import type { ScreenplayParseResult } from "@/lib/screenplay/types";

export async function parsePdfContent(buffer: Buffer): Promise<ScreenplayParseResult | { error: string }> {
  let parser: PDFParse | null = null;

  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text?.replace(/\r\n/g, "\n").trim() ?? "";

    if (!text || text.replace(/\s+/g, "").length < 80) {
      return {
        error:
          "Scanned PDF — export a text PDF or .fdx from your writing app. This file has no readable text layer.",
      };
    }

    const pageCountEst = result.pages?.length ?? result.total ?? null;
    const structured = structureScreenplayText(text, pageCountEst);
    if ("error" in structured) return structured;
    return structured;
  } catch {
    return { error: "Could not read this PDF file." };
  } finally {
    if (parser) {
      await parser.destroy().catch(() => undefined);
    }
  }
}
