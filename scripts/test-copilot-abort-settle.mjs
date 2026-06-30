/**
 * Settlement decision tests for co-pilot abort (pure logic, no DB).
 * Mirrors lib/credits/copilot-settle.ts and lib/credits/pricing.ts.
 */

const CREDITS_PER_DOLLAR = 10;
const MARKUP = 2.0;

const OPUS_RATES = {
  inputUsdPerMtok: 5,
  outputUsdPerMtok: 25,
  cacheWriteMultiplier: 1.25,
  cacheReadMultiplier: 0.1,
};

function usdToCredits(usd) {
  return Math.ceil(usd * MARKUP * CREDITS_PER_DOLLAR);
}

function copilotTurnCreditsFromUsage(modelId, usage) {
  const rates = OPUS_RATES;
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const usd =
    (inputTokens / 1_000_000) * rates.inputUsdPerMtok +
    (outputTokens / 1_000_000) * rates.outputUsdPerMtok +
    (cacheCreation / 1_000_000) * rates.inputUsdPerMtok * rates.cacheWriteMultiplier +
    (cacheRead / 1_000_000) * rates.inputUsdPerMtok * rates.cacheReadMultiplier;
  if (usd <= 0) return 0;
  return usdToCredits(usd);
}

function estimateCopilotTurnCredits() {
  const usd =
    (14_000 / 1_000_000) * OPUS_RATES.inputUsdPerMtok +
    (1_800 / 1_000_000) * OPUS_RATES.outputUsdPerMtok;
  return Math.max(1, usdToCredits(usd));
}

function resolveCopilotTurnCommitCredits(modelId, reserveEstimate, billing) {
  if (!billing.anthropicBillable) return 0;
  if (billing.usage) {
    const input = billing.usage.input_tokens ?? 0;
    const output = billing.usage.output_tokens ?? 0;
    const cacheCreate = billing.usage.cache_creation_input_tokens ?? 0;
    const cacheRead = billing.usage.cache_read_input_tokens ?? 0;
    if (input + output + cacheCreate + cacheRead > 0) {
      return copilotTurnCreditsFromUsage(modelId, billing.usage);
    }
  }
  return reserveEstimate;
}

function decideCopilotTurnSettlement(estimate, billing) {
  const actual = resolveCopilotTurnCommitCredits("claude-opus-4-8", estimate, billing);
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

const RESERVE = estimateCopilotTurnCredits();
const partialUsage = { input_tokens: 420, output_tokens: 88 };
const partialCredits = copilotTurnCreditsFromUsage("claude-opus-4-8", partialUsage);

console.log("Co-pilot abort settlement simulation\n");
console.log(`Reserve estimate: ${RESERVE} credits\n`);

console.log("(a) Abort before Anthropic responds — full release");
assertEqual(
  "no billable work",
  decideCopilotTurnSettlement(RESERVE, { anthropicBillable: false }),
  { action: "release", amount: 0 },
);

console.log("\n(b) Abort mid-stream after tokens generated — commit actual usage");
assertEqual(
  "partial usage",
  decideCopilotTurnSettlement(RESERVE, {
    anthropicBillable: true,
    usage: partialUsage,
  }),
  { action: "commit", amount: partialCredits },
);
assertEqual(
  "billable but missing usage (fallback to reserve)",
  decideCopilotTurnSettlement(RESERVE, { anthropicBillable: true }),
  { action: "commit", amount: RESERVE },
);

console.log("\n(c) Abort after tool image generation already fired — tool credits committed");
const imageEstimate = 1;
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

console.log("\n(d) Normal completion — commit usage-based credits");
const fullUsage = {
  input_tokens: 1200,
  output_tokens: 650,
  cache_read_input_tokens: 10_000,
  cache_creation_input_tokens: 0,
};
const fullCredits = copilotTurnCreditsFromUsage("claude-opus-4-8", fullUsage);
assertEqual(
  "completed turn",
  decideCopilotTurnSettlement(RESERVE, { anthropicBillable: true, usage: fullUsage }),
  { action: "commit", amount: fullCredits },
);

console.log(
  process.exitCode === 1
    ? "\nSome assertions failed."
    : "\nAll settlement scenarios passed.",
);
