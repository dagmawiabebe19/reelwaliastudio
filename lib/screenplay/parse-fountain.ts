import { structureScreenplayText } from "@/lib/screenplay/structure";
import type { ScreenplayParseResult } from "@/lib/screenplay/types";

function fountainToScreenplayText(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  let inBoneyard = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed.startsWith("/*")) {
      inBoneyard = true;
    }
    if (inBoneyard) {
      if (trimmed.endsWith("*/")) inBoneyard = false;
      continue;
    }

    if (trimmed.startsWith("Title:") || trimmed.startsWith("Credit:") || trimmed.startsWith("Author:")) {
      continue;
    }

    if (trimmed.startsWith("=")) {
      out.push(trimmed.slice(1).trim());
      out.push("");
      continue;
    }

    if (trimmed.startsWith(".") && trimmed.length > 1) {
      out.push(trimmed.slice(1).trim());
      out.push("");
      continue;
    }

    if (trimmed.startsWith("!")) {
      out.push(trimmed.slice(1).trim());
      continue;
    }

    if (trimmed.startsWith("@")) {
      out.push(trimmed.slice(1).trim());
      continue;
    }

    if (trimmed.startsWith("~")) {
      out.push(`(${trimmed.slice(1).trim()})`);
      continue;
    }

    if (trimmed === ">") {
      const forced = (lines[i + 1] ?? "").trim();
      if (forced) {
        out.push(forced);
        i += 1;
      }
      continue;
    }

    out.push(line.replace(/\t/g, "    "));
  }

  return out.join("\n");
}

export function parseFountainContent(
  buffer: Buffer,
  format: "fountain" | "txt",
): ScreenplayParseResult | { error: string } {
  const text = buffer.toString("utf8");
  if (!text.trim()) {
    return { error: "The file is empty." };
  }

  const screenplayText = format === "fountain" ? fountainToScreenplayText(text) : text;
  return structureScreenplayText(screenplayText);
}
