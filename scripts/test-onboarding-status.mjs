/**
 * Onboarding eligibility simulation (pure logic, no DB).
 * Mirrors lib/onboarding/status.ts phase rules.
 */

function shouldShowPhase(input) {
  if (input.completed) return false;

  const { projectCount, seriesCount, episodeCount = 0, episodeSceneCount = 0 } = input.counts;

  switch (input.phase) {
    case "create-project":
      return projectCount === 0 && seriesCount === 0;
    case "create-series":
      return projectCount > 0 && seriesCount === 0;
    case "plan-episode":
      return seriesCount > 0 && episodeCount === 0;
    case "studio-segments":
      return seriesCount > 0 && episodeSceneCount === 0;
    default:
      return false;
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`  ✗ ${msg}`);
    process.exitCode = 1;
    return;
  }
  console.log(`  ✓ ${msg}`);
}

console.log("Onboarding status simulation\n");

assert(
  shouldShowPhase({
    completed: false,
    phase: "create-project",
    counts: { projectCount: 0, seriesCount: 0 },
  }),
  "brand-new user sees create-project",
);

assert(
  !shouldShowPhase({
    completed: true,
    phase: "create-project",
    counts: { projectCount: 0, seriesCount: 0 },
  }),
  "completed flag hides onboarding",
);

assert(
  !shouldShowPhase({
    completed: false,
    phase: "create-project",
    counts: { projectCount: 2, seriesCount: 1 },
  }),
  "existing user with data skips create-project",
);

assert(
  shouldShowPhase({
    completed: false,
    phase: "create-series",
    counts: { projectCount: 1, seriesCount: 0 },
  }),
  "user with project but no series sees create-series",
);

assert(
  shouldShowPhase({
    completed: false,
    phase: "plan-episode",
    counts: { projectCount: 1, seriesCount: 1, episodeCount: 0 },
  }),
  "series with zero episodes sees plan-episode",
);

assert(
  shouldShowPhase({
    completed: false,
    phase: "studio-segments",
    counts: { projectCount: 1, seriesCount: 1, episodeSceneCount: 0 },
  }),
  "episode studio with zero segments sees studio-segments",
);

assert(
  !shouldShowPhase({
    completed: false,
    phase: "studio-segments",
    counts: { projectCount: 1, seriesCount: 1, episodeSceneCount: 3 },
  }),
  "episode with segments hides studio-segments onboarding",
);

console.log(
  process.exitCode === 1
    ? "\nSome assertions failed."
    : "\nAll onboarding scenarios passed.",
);
