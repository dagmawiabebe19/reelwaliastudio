import { XMLParser } from "fast-xml-parser";
import { structureScreenplayText } from "@/lib/screenplay/structure";
import type { ScreenplayParseResult } from "@/lib/screenplay/types";

type FdxParagraph = {
  "@_Type"?: string;
  Text?: string | Array<string | { "#text"?: string }>;
};

function paragraphText(paragraph: FdxParagraph): string {
  const raw = paragraph.Text;
  if (!raw) return "";
  if (typeof raw === "string") return raw.trim();
  if (!Array.isArray(raw)) {
    if (typeof raw === "object" && raw["#text"]) return String(raw["#text"]).trim();
    return "";
  }

  return raw
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && part["#text"]) return String(part["#text"]);
      return "";
    })
    .join("")
    .trim();
}

function fdxToScreenplayText(xml: string): string {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => name === "Paragraph" || name === "Text",
  });

  const doc = parser.parse(xml) as {
    FinalDraft?: { Content?: { Paragraph?: FdxParagraph | FdxParagraph[] } };
  };

  const paragraphs = doc.FinalDraft?.Content?.Paragraph;
  if (!paragraphs) return "";

  const list = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
  const lines: string[] = [];

  for (const paragraph of list) {
    const type = paragraph["@_Type"] ?? "";
    const text = paragraphText(paragraph);
    if (!text) continue;

    if (type === "Scene Heading") {
      lines.push(text);
      lines.push("");
      continue;
    }

    if (type === "Character") {
      lines.push(text);
      continue;
    }

    if (type === "Dialogue" || type === "Parenthetical" || type === "Action") {
      lines.push(text);
      if (type === "Dialogue") lines.push("");
      continue;
    }

    lines.push(text);
  }

  return lines.join("\n");
}

export function parseFdxContent(buffer: Buffer): ScreenplayParseResult | { error: string } {
  const xml = buffer.toString("utf8");
  if (!xml.includes("<FinalDraft") && !xml.includes("<Paragraph")) {
    return { error: "Invalid Final Draft (.fdx) file." };
  }

  const screenplayText = fdxToScreenplayText(xml);
  if (!screenplayText.trim()) {
    return { error: "No screenplay content found in this .fdx file." };
  }

  return structureScreenplayText(screenplayText);
}
