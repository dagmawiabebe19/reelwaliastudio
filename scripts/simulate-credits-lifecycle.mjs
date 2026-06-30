#!/usr/bin/env node
/**
 * In-process simulation of credit RPC state transitions (no database).
 * Mirrors 012_credits.sql logic for quick verification before migration is applied.
 */

function assertBalance(label, actual, expected) {
  const ok =
    actual.available === expected.available && actual.reserved === expected.reserved;
  console.log(
    `${ok ? "✓" : "✗"} ${label}: available=${actual.available}, reserved=${actual.reserved}` +
      (ok ? "" : ` (expected available=${expected.available}, reserved=${expected.reserved})`),
  );
  if (!ok) process.exit(1);
}

const state = { available: 0, reserved: 0 };
const reservations = new Map();

function total() {
  return state.available + state.reserved;
}

function grant(amount) {
  state.available += amount;
  return total();
}

function reserve(amount) {
  if (state.available < amount) throw new Error("insufficient_credits");
  const id = crypto.randomUUID();
  state.available -= amount;
  state.reserved += amount;
  reservations.set(id, { held: amount, open: true });
  return id;
}

function commit(reservationId, actual) {
  const r = reservations.get(reservationId);
  if (!r || !r.open) return;
  const extra = Math.max(0, actual - r.held);
  if (state.available < extra) throw new Error("insufficient_credits");
  state.available += r.held - actual;
  state.reserved -= r.held;
  r.open = false;
}

function release(reservationId) {
  const r = reservations.get(reservationId);
  if (!r || !r.open) return;
  state.available += r.held;
  state.reserved -= r.held;
  r.open = false;
}

console.log("Credit lifecycle simulation (mirrors Postgres RPC logic)");
console.log("---");

grant(100);
assertBalance("After grant 100", state, { available: 100, reserved: 0 });

const r1 = reserve(40);
assertBalance("After reserve 40", state, { available: 60, reserved: 40 });

commit(r1, 35);
assertBalance("After commit actual 35", state, { available: 65, reserved: 0 });

const r2 = reserve(30);
assertBalance("After reserve 30", state, { available: 35, reserved: 30 });

release(r2);
assertBalance("After release 30", state, { available: 65, reserved: 0 });

try {
  reserve(999);
  console.error("✗ reserve 999 should have failed");
  process.exit(1);
} catch (error) {
  console.log(`✓ reserve 999 rejected: ${error.message}`);
}

commit(r1, 35);
release(r2);
assertBalance("After idempotent re-commit/re-release", state, {
  available: 65,
  reserved: 0,
});

console.log("---");
console.log("Simulation passed. Run `npm run test:credits` after applying 012_credits.sql.");
