# Approval gate — click-through checklist

Apply migration **019** in the Supabase SQL Editor first (`supabase/migrations/019_profile_approval.sql`).

## Post-migration SQL verification

```sql
-- Owner must be admin + approved
SELECT id, email, is_admin, approval_status, approved_at
FROM public.profiles
WHERE email = 'dagmawiabebe19@gmail.com'
   OR id = 'aade471f-9614-46b5-8238-53225c78b0f6';

-- Dev test user must be approved
SELECT id, approval_status, approved_at
FROM public.profiles
WHERE id = '11111111-1111-1111-1111-111111111111';
```

## Manual click-through

- [ ] **Fresh signup (non-admin)** — request magic link, sign in → lands on `/pending` (not Home).
- [ ] **Deep URL while pending** — visit `/projects`, `/credits`, `/series/.../episodes/...` → all redirect to `/pending`.
- [ ] **Pending screen** — shows email, waitlist copy, Logout only (no sidebar/nav).
- [ ] **Owner login** (`dagmawiabebe19@gmail.com`) → full app, never `/pending`.
- [ ] **Admin login** → full app + sidebar shows “Pending approvals” with badge when count > 0.
- [ ] **Approve pending user** — Admin → Pending approvals → Approve → user refreshes → reaches app.
- [ ] **Welcome credits on approve** — approved user has 100 credits (`signup:welcome` in ledger); signup alone gave 0.
- [ ] **Self-approve blocked** — as pending user, direct `UPDATE profiles SET approval_status='approved'` → `approval_status is read-only`.
- [ ] **No redirect loops** — `/login`, `/auth/callback`, `/pending` reachable while pending; `/login` still works.
- [ ] **Reject flow** — rejected user sees rejection copy on `/pending`, still cannot reach app routes.

## Deploy note

Gate runs in `app/(app)/layout.tsx` only. Magic link / callback / session code unchanged.
