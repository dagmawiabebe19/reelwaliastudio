export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { scheduleStartupStuckTakeSweep } = await import("@/lib/ai/generation/take-reconcile");
      scheduleStartupStuckTakeSweep();
    } catch (error) {
      console.error("[instrumentation] failed to schedule take reconcile startup sweep", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    try {
      const { scheduleStartupStuckReservationSweep } = await import(
        "@/lib/credits/reservation-reconcile"
      );
      scheduleStartupStuckReservationSweep();
    } catch (error) {
      console.error("[instrumentation] failed to schedule reservation reconcile startup sweep", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }
}
