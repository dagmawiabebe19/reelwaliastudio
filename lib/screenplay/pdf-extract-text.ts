import {
  ensurePdfJsRuntime,
  isPdfRuntimeMissingError,
} from "@/lib/screenplay/pdf-runtime";
import { extractPdfTextWithClaude } from "@/lib/screenplay/pdf-vision-extract";

const MIN_EXTRACTED_CHARS = 80;

export type PdfTextExtractionMethod = "pdfjs" | "claude_vision";

export type PdfTextExtraction = {
  text: string;
  method: PdfTextExtractionMethod;
  pageCountEst: number | null;
};

type PdfJsAttempt = {
  text: string;
  pageCountEst: number | null;
} | null;

async function tryExtractWithPdfJs(buffer: Buffer): Promise<PdfJsAttempt> {
  let parser: InstanceType<(typeof import("pdf-parse"))["PDFParse"]> | null = null;

  try {
    await ensurePdfJsRuntime();
    const { PDFParse } = await import("pdf-parse");
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text?.replace(/\r\n/g, "\n").trim() ?? "";
    const pageCountEst = result.pages?.length ?? result.total ?? null;
    return { text, pageCountEst };
  } catch (error) {
    console.warn("[screenplay-pdf] pdfjs text extraction failed", {
      error: error instanceof Error ? error.message : String(error),
      isRuntimeMissing: isPdfRuntimeMissingError(error),
    });
    return null;
  } finally {
    if (parser) {
      await parser.destroy().catch(() => undefined);
    }
  }
}

function hasEnoughText(text: string): boolean {
  return text.replace(/\s+/g, "").length >= MIN_EXTRACTED_CHARS;
}

/** Extract raw screenplay text from a PDF — pdfjs first, Claude vision for scanned/image PDFs. */
export async function extractPdfText(
  buffer: Buffer,
): Promise<PdfTextExtraction | { error: string }> {
  const pdfJs = await tryExtractWithPdfJs(buffer);

  if (pdfJs && hasEnoughText(pdfJs.text)) {
    console.log("[screenplay-pdf] extracted text via pdfjs", {
      textLength: pdfJs.text.length,
      pageCountEst: pdfJs.pageCountEst,
    });
    return {
      text: pdfJs.text,
      method: "pdfjs",
      pageCountEst: pdfJs.pageCountEst,
    };
  }

  const sparseChars = pdfJs?.text.replace(/\s+/g, "").length ?? 0;
  console.log("[screenplay-pdf] falling back to Claude vision OCR", {
    pdfjsChars: sparseChars,
    reason: pdfJs ? "sparse_text_layer" : "pdfjs_failed",
  });

  const vision = await extractPdfTextWithClaude(buffer);
  if ("error" in vision) {
    if (pdfJs && sparseChars > 0) {
      return {
        error:
          "This PDF has very little extractable text and vision OCR could not read it. Export a text PDF or upload .fdx / .fountain.",
      };
    }
    return vision;
  }

  return {
    text: vision.text,
    method: "claude_vision",
    pageCountEst: vision.pageCountEst ?? pdfJs?.pageCountEst ?? null,
  };
}
