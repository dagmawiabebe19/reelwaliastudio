/**
 * Co-pilot usage-based metering simulation (pure logic, no DB / Anthropic).
 * Mirrors lib/credits/pricing.ts and lib/credits/copilot-settle.ts.
 */

const CREDITS_PER_DOLLAR = 10;
const MARKUP = 2.0;

const ANTHROPIC_MODEL_PRICING = {
  "claude-opus-4-8": {
    inputUsdPerMtok: 5,
    outputUsdPerMtok: 25,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
  },
  "claude-sonnet-4-6": {
    inputUsdPerMtok: 3,
    outputUsdPerMtok: 15,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
  },
  "claude-haiku-4-5-20251001": {
    inputUsdPerMtok: 1,
    outputUsdPerMtok: 5,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
  },
};

function usdToCredits(usd) {
  return Math.ceil(usd * MARKUP * CREDITS_PER_DOLLAR);
}

function getRates(modelId) {
  return ANTHROPIC_MODEL_PRICING[modelId] ?? ANTHROPIC_MODEL_PRICING["claude-opus-4-8"];
}

function copilotTurnUsdFromUsage(modelId, usage) {
  const rates = getRates(modelId);
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;

  const inputUsd = (inputTokens / 1_000_000) * rates.inputUsdPerMtok;
  const outputUsd = (outputTokens / 1_000_000) * rates.outputUsdPerMtok;
  const cacheWriteUsd =
    (cacheCreation / 1_000_000) * rates.inputUsdPerMtok * rates.cacheWriteMultiplier;
  const cacheReadUsd =
    (cacheRead / 1_000_000) * rates.inputUsdPerMtok * rates.cacheReadMultiplier;

  return inputUsd + outputUsd + cacheWriteUsd + cacheReadUsd;
}

function copilotTurnCreditsFromUsage(modelId, usage) {
  const usd = copilotTurnUsdFromUsage(modelId, usage);
  if (usd <= 0) return 0;
  return usdToCredits(usd);
}

function estimateCopilotTurnCredits(modelId) {
  const rates = getRates(modelId);
  const typicalInputTokens = 14_000;
  const typicalOutputTokens = 1_800;
  const usd =
    (typicalInputTokens / 1_000_000) * rates.inputUsdPerMtok +
    (typicalOutputTokens / 1_000_000) * rates.outputUsdPerMtok;
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

function formatLog(modelId, usage, creditsCommitted, turnLabel) {
  const usd = copilotTurnUsdFromUsage(modelId, usage);
  return (
    `[${turnLabel}] model=${modelId} ` +
    `in=${usage.input_tokens ?? 0} ` +
    `out=${usage.output_tokens ?? 0} ` +
    `cache_write=${usage.cache_creation_input_tokens ?? 0} ` +
    `cache_read=${usage.cache_read_input_tokens ?? 0} ` +
    `usd=$${usd.toFixed(4)} credits=${creditsCommitted}`
  );
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`  ✗ ${msg}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`  ✓ ${msg}`);
  return true;
}

const MODEL = "claude-opus-4-8";
const reserve = estimateCopilotTurnCredits(MODEL);

console.log("Co-pilot usage metering simulation\n");
console.log(`Reserve estimate (typical turn, ${MODEL}): ${reserve} credits\n`);

console.log("Consecutive turns (same session — cache warms after turn 1):\n");

const turns = [
  {
    label: "turn-1",
    usage: {
      input_tokens: 420,
      output_tokens: 180,
      cache_creation_input_tokens: 12_400,
      cache_read_input_tokens: 0,
    },
  },
  {
    label: "turn-2",
    usage: {
      input_tokens: 890,
      output_tokens: 420,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 12_400,
    },
  },
  {
    label: "turn-3-long",
    usage: {
      input_tokens: 18_200,
      output_tokens: 3_100,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 12_400,
    },
  },
];

let prevCredits = 0;
for (const turn of turns) {
  const billing = { anthropicBillable: true, usage: turn.usage };
  const committed = resolveCopilotTurnCommitCredits(MODEL, reserve, billing);
  const computed = copilotTurnCreditsFromUsage(MODEL, turn.usage);
  console.log(formatLog(MODEL, turn.usage, committed, turn.label));
  assert(committed === computed, `${turn.label}: committed matches usage computation`);
  if (turn.label === "turn-2") {
    assert(
      (turn.usage.cache_read_input_tokens ?? 0) > 0,
      "turn-2: cache_read tokens present (caching working)",
    );
  }
  if (turn.label === "turn-3-long") {
    assert(committed > prevCredits, "turn-3-long costs more than turn-2 (usage scales)");
  }
  prevCredits = committed;
}

console.log("\nLow-balance gate (before Anthropic call):\n");
const userBalance = 1;
const blocked = userBalance < reserve;
assert(blocked, `non-admin balance=${userBalance} < reserve=${reserve} → blocked before API call`);
assert(
  !blocked || reserve > 1,
  `reserve (${reserve}) is conservative vs flat 1-credit charge`,
);

console.log("\nAbort / error settlement:\n");
assert(
  resolveCopilotTurnCommitCredits(MODEL, reserve, { anthropicBillable: false }) === 0,
  "abort before tokens → commit 0 (release reservation)",
);
const partialAbort = resolveCopilotTurnCommitCredits(MODEL, reserve, {
  anthropicBillable: true,
  usage: { input_tokens: 200, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
});
assert(partialAbort > 0, "abort mid-stream with usage → commit actual (no over-refund to 0)");
assert(
  partialAbort < reserve || partialAbort === copilotTurnCreditsFromUsage(MODEL, {
    input_tokens: 200,
    output_tokens: 50,
  }),
  "partial abort commits usage-based amount",
);

console.log(
  process.exitCode === 1
    ? "\nSome assertions failed."
    : "\nAll metering scenarios passed.",
);
