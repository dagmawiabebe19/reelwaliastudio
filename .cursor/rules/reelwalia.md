---
# ReelWalia Studio — Project Rules (always apply)

## Environment
- This project uses **npm**, NOT pnpm. Never create or commit pnpm-lock.yaml. Use package-lock.json.
- Restart dev with `npm run dev:clean`.
- Every task ends with: `npm run build` must pass, then `git add / commit / push`.

## Database & migrations
- Supabase migrations: WRITE the migration file, then PRINT the SQL under "RUN THIS MANUALLY IN THE SUPABASE SQL EDITOR". NEVER assume a migration is applied; never auto-apply. Flag it for manual apply.
- After schema changes that add functions, remember Postgres grants EXECUTE to PUBLIC by default — explicitly REVOKE from PUBLIC/anon/authenticated and GRANT only to service_role for anything sensitive.

## Credits (money — highest care)
- The credit ledger is append-only. Balance is derived; never mutate history.
- All credit movement goes through the RPCs (grant/reserve/commit/release), which are **service_role only**. The browser NEVER calls a credit-moving RPC and never sends the cost — the server computes cost from lib/credits/pricing.ts.
- Reserve ONCE per logical job; commit at actual on success; release on failure. Retries live INSIDE the job, not per-attempt.
- Do NOT change reserve/commit/release semantics without explicit instruction.

## Do-not-touch fences (unless explicitly told)
- Effective-bindings / readiness guard logic (lib/production/effective-bindings.ts, validateSeedanceVideoGeneration).
- The episode studio three-pane layout and generation panel.
- Prompt-caching structure of the co-pilot context (cache_control blocks).
- Auth / magic-link / callback / session code — gate access in the app layout, not the auth flow.

## Background/ops tasks
- Background sweeps (reconcile, reservation-sweep) run at startup with NO request context — they MUST use the service-role admin client (createAdminClient), never a cookies()/request-scoped client. Wrap detached tasks so they log-and-continue and can never crash a page render.

## Safety
- Admins (esp. dagmawiabebe19@gmail.com) must never be locked out by any gate — fail-open for admins.
- Security-sensitive state (is_admin, approval_status) is writable only by service_role, trigger-protected against self-modification.

## Working style
- Audit/diagnose and REPORT before making risky changes. Prefer reverting to a known-good state over forward-debugging under pressure.
- Keep user-facing copy free of internal jargon (no "stubbed", "TODO", raw errors).

---
