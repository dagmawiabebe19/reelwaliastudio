import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

/** Service-role Supabase client (no cookies). Used for ops/background tasks. */
export type ServiceDbClient = ReturnType<typeof createAdminClient>;
