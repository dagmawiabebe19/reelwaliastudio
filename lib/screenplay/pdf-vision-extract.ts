import Anthropic from "@anthropic-ai/sdk";

/** Vision OCR fallback for scanned/image PDFs (Anthropic API, not Vercel compute). */
export const PDF_VISION_MODEL = "claude-sonnet-4-6" as const;

const TRANSCRIBE_PROMPT = `Transcribe this entire screenplay as plain text for production import.

Preserve exactly:
- Scene headings (INT./EXT./INT/EXT. sluglines)
- Character cues in ALL CAPS before dialogue
- Action lines, dialogue, and parentheticals
- Scene order top to bottom

Return ONLY the screenplay text. No commentary, no markdown fences.`;

export type PdfVisionExtraction = {
  text: string;
  pageCountEst: number | null;
  inputTokens: number;
  outputTokens: number;
};

export async function extractPdfTextWithClaude(
  buffer: Buffer,
): Promise<PdfVisionExtraction | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return {
      error:
        "PDF vision import is not configured. Upload a .fdx or .fountain file, or export a text-based PDF.",
    };
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: PDF_VISION_MODEL,
      max_tokens: 32_000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: buffer.toString("base64"),
              },
            },
            { type: "text", text: TRANSCRIBE_PROMPT },
          ],
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .replace(/\r\n/g, "\n")
      .trim();

    if (!text || text.replace(/\s+/g, "").length < 80) {
      return {
        error:
          "This PDF has no readable screenplay text — try a text-based PDF export or upload .fdx / .fountain instead.",
      };
    }

    const pageCountEst = estimatePagesFromVisionText(text);

    console.log("[screenplay-pdf] Claude vision extraction completed", {
      model: PDF_VISION_MODEL,
      textLength: text.length,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      pageCountEst,
    });

    return {
      text,
      pageCountEst,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch (error) {
    console.error("[screenplay-pdf] Claude vision extraction failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      error:
        "Could not read this PDF with vision OCR. Try uploading a .fdx or .fountain export instead.",
    };
  }
}

function estimatePagesFromVisionText(text: string): number {
  const pageMarkers = text.match(/--\s*\d+\s+of\s+\d+\s*--/gi);
  if (pageMarkers?.length) {
    const last = pageMarkers[pageMarkers.length - 1];
    const match = last.match(/of\s+(\d+)/i);
    if (match) return Number.parseInt(match[1], 10);
  }
  const chars = text.replace(/\s+/g, " ").trim().length;
  return Math.max(1, Math.ceil(chars / 2500));
}
