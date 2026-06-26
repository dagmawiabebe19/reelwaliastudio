/** Env-gated dev bypass — safe to import from middleware (no server-only). */
export function isDevNoAuth(): boolean {
  return process.env.DEV_NO_AUTH === "true";
}
