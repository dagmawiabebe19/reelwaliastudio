/** pdfjs-dist (via pdf-parse) needs browser canvas APIs on Node/Vercel. */
export async function ensurePdfJsRuntime(): Promise<void> {
  const runtime = globalThis as unknown as Record<string, unknown>;
  if (runtime.DOMMatrix && runtime.ImageData && runtime.Path2D) return;

  try {
    const canvas = await import("@napi-rs/canvas");
    if (!runtime.DOMMatrix && canvas.DOMMatrix) runtime.DOMMatrix = canvas.DOMMatrix;
    if (!runtime.ImageData && canvas.ImageData) runtime.ImageData = canvas.ImageData;
    if (!runtime.Path2D && canvas.Path2D) runtime.Path2D = canvas.Path2D;
  } catch (error) {
    console.error("[screenplay-pdf] @napi-rs/canvas unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function isPdfRuntimeMissingError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("DOMMatrix is not defined") ||
    msg.includes("ImageData is not defined") ||
    msg.includes("Path2D is not defined") ||
    msg.includes("@napi-rs/canvas")
  );
}
