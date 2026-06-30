/**
 * Settlement decision tests for co-pilot abort (pure logic, no DB).
 * Mirrors lib/credits/copilot-settle.ts and withCreditsAbortable behavior.
 */

const COPILOT_TURN_CREDITS = 1;

function copilotTurnCreditsFromUsage(estimate, billing) {
  if (!billing.anthropicBillable) return 0;
  const input = billing.usage?.input_tokens ?? 0;
  const output = billing.usage?.output_tokens ?? 0;
  if (input + output > 0) {
    return Math.min(estimate, COPILOT_TURN_CREDITS);
  }
  return estimate;
}

function decideCopilotTurnSettlement(aborted, estimate, billing) {
  if (!aborted) return { action: "commit", amount: estimate };
  if (!billing.anthropicBillable) return { action: "release", amount: 0 };
  const actual = copilotTurnCreditsFromUsage(estimate, billing);
  if (actual <= 0) return { action: "release", amount: 0 };
  return { action: "commit", amount: actual };
}

function decideToolSettlement(aborted, billableStarted, estimate, actualCredits) {
  if (!aborted) return { action: "commit", amount: actualCredits };
  if (billableStarted) return { action: "commit", amount: estimate };
  return { action: "release", amount: 0 };
}

function assertEqual(label, actual, expected) {
  const ok =
    actual.action === expected.action &&
    actual.amount === expected.amount;
  const line = ok
    ? `  ✓ ${label}`
    : `  ✗ ${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;
  console.log(line);
  if (!ok) process.exitCode = 1;
}

console.log("Co-pilot abort settlement simulation\n");

console.log("(a) Abort before Anthropic responds — full release");
assertEqual(
  "no billable work",
  decideCopilotTurnSettlement(true, COPILOT_TURN_CREDITS, { anthropicBillable: false }),
  { action: "release", amount: 0 },
);

console.log("\n(b) Abort mid-stream after tokens generated — commit, no over-refund");
assertEqual(
  "partial usage",
  decideCopilotTurnSettlement(true, COPILOT_TURN_CREDITS, {
    anthropicBillable: true,
    usage: { input_tokens: 420, output_tokens: 88 },
  }),
  { action: "commit", amount: 1 },
);
assertEqual(
  "billable but missing usage (err on commit)",
  decideCopilotTurnSettlement(true, COPILOT_TURN_CREDITS, { anthropicBillable: true }),
  { action: "commit", amount: 1 },
);

console.log("\n(c) Abort after tool image generation already fired — tool credits committed");
const imageEstimate = 1; // estimateImageCredits(1) in test env
assertEqual(
  "provider work started",
  decideToolSettlement(true, true, imageEstimate, imageEstimate),
  { action: "commit", amount: imageEstimate },
);
assertEqual(
  "provider work not started",
  decideToolSettlement(true, false, imageEstimate, imageEstimate),
  { action: "release", amount: 0 },
);

console.log("\n(d) Normal completion — commit turn estimate");
assertEqual(
  "completed turn",
  decideCopilotTurnSettlement(false, COPILOT_TURN_CREDITS, { anthropicBillable: true }),
  { action: "commit", amount: 1 },
);

console.log(
  process.exitCode === 1
    ? "\nSome assertions failed."
    : "\nAll settlement scenarios passed.",
);
