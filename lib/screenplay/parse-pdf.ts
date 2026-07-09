import { structureScreenplayText } from "@/lib/screenplay/structure";
import {
  ensurePdfJsRuntime,
  isPdfRuntimeMissingError,
} from "@/lib/screenplay/pdf-runtime";
import type { ScreenplayParseResult } from "@/lib/screenplay/types";

export async function parsePdfContent(buffer: Buffer): Promise<ScreenplayParseResult | { error: string }> {
  let parser: InstanceType<(typeof import("pdf-parse"))["PDFParse"]> | null = null;

  try {
    await ensurePdfJsRuntime();
    const { PDFParse } = await import("pdf-parse");
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
  } catch (error) {
    if (isPdfRuntimeMissingError(error)) {
      console.error("[screenplay-pdf] PDF runtime missing on server", {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        error:
          "PDF import is temporarily unavailable on the server. Upload a .fdx or .fountain file instead.",
      };
    }

    console.error("[screenplay-pdf] parse failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return { error: "Could not read this PDF file." };
  } finally {
    if (parser) {
      await parser.destroy().catch(() => undefined);
    }
  }
}
