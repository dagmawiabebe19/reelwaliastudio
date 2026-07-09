#!/usr/bin/env node
/**
 * Deterministic screenplay parse verification (Phase A).
 * Usage: npm run test:screenplay-parse -- [path/to/file]
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFdxContent } from "../lib/screenplay/parse-fdx";
import { parseFountainContent } from "../lib/screenplay/parse-fountain";
import { parsePdfContent } from "../lib/screenplay/parse-pdf";
import type { ScreenplayParseResult } from "../lib/screenplay/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function printReport(label: string, result: ScreenplayParseResult | { error: string }): boolean {
  console.log(`\n=== ${label} ===`);
  if ("error" in result) {
    console.log("FAILED:", result.error);
    return false;
  }

  console.log(`Scenes: ${result.scenes.length}`);
  console.log(`Characters: ${result.characterNames.join(", ") || "(none)"}`);
  console.log(`Locations: ${result.locationNames.join(", ") || "(none)"}`);
  console.log(`Unrecognized blocks: ${result.unrecognizedBlocksPct}%`);
  console.log(`Page estimate: ${result.pageCountEst ?? "n/a"}`);
  for (const scene of result.scenes) {
    console.log(`  ${scene.sceneNumber}. ${scene.slugline} [${scene.characters.join(", ")}]`);
  }
  return true;
}

async function main() {
  const customPath = process.argv[2];
  const fountainPath = customPath ?? path.join(__dirname, "fixtures/sample.fountain");
  const fdxPath = path.join(__dirname, "fixtures/sample.fdx");

  let fountainOk = true;
  let fdxOk = true;
  let pdfOk = true;

  if (customPath?.toLowerCase().endsWith(".pdf")) {
    const pdfBuf = await readFile(customPath);
    pdfOk = printReport(`PDF (${path.basename(customPath)})`, await parsePdfContent(pdfBuf));
  } else {
    const fountainBuf = await readFile(fountainPath);
    const fdxBuf = await readFile(fdxPath);

    fountainOk = printReport(
      customPath ? `Custom (${path.basename(fountainPath)})` : "Fountain fixture",
      parseFountainContent(
        fountainBuf,
        fountainPath.endsWith(".txt") ? "txt" : "fountain",
      ),
    );
    fdxOk = printReport("FDX fixture", parseFdxContent(fdxBuf));
  }

  const emptyPdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
  );
  const scanned = await parsePdfContent(emptyPdf);
  console.log("\n=== Scanned / empty PDF ===");
  console.log("FAILED (expected):", "error" in scanned ? scanned.error : "(unexpected success)");

  const allOk = fountainOk && fdxOk && pdfOk && "error" in scanned;
  if (!allOk) {
    process.exitCode = 1;
    console.error("\nOne or more parse checks failed.");
  } else {
    console.log("\nAll Phase A parse checks passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
