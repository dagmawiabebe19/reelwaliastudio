export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { scheduleStartupStuckTakeSweep } = await import("@/lib/ai/generation/take-reconcile");
    scheduleStartupStuckTakeSweep();
  }
}
