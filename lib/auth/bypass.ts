/**
 * Dev-only auth bypass gate. Safe to import from middleware (no server-only).
 * NEVER returns true in production — even if DEV_NO_AUTH is set in Vercel env.
 */
export function isDevAuthBypassActive(): boolean {
  if (process.env.DEV_NO_AUTH === "true" && process.env.NODE_ENV === "production") {
    console.error(
      "[auth] SECURITY: DEV_NO_AUTH is set while NODE_ENV=production — bypass disabled; real auth required.",
    );
    return false;
  }

  return process.env.NODE_ENV !== "production" && process.env.DEV_NO_AUTH === "true";
}
