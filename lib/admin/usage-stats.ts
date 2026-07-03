import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { SIGNUP_CREDIT_GRANT_AMOUNT } from "@/lib/credits/constants";
import { categorizeSpendReference, type SpendCategory } from "@/lib/admin/spend-category";
import type { CreditLedgerEntry } from "@/lib/credits/types";

type LedgerRow = Pick<
  CreditLedgerEntry,
  "user_id" | "amount" | "type" | "status" | "reference" | "reservation_id" | "created_at"
>;

type ProfileRow = {
  id: string;
  email: string | null;
  created_at: string;
};

type BalanceRow = {
  user_id: string;
  available: number;
  reserved: number;
};

export type SpendBreakdown = Record<SpendCategory, number>;

export type AdminUsageAccountRow = {
  userId: string;
  email: string;
  signupDate: string;
  creditsGrantedWelcome: number;
  creditsGrantedManual: number;
  creditsGrantedTotal: number;
  creditsSpent: number;
  available: number;
  reserved: number;
  spendByCategory: SpendBreakdown;
  lastActivityAt: string | null;
  welcomeBurned: boolean;
};

export type SignupsPerDay = {
  date: string;
  count: number;
};

export type AdminUsageSummary = {
  signupsPerDay: SignupsPerDay[];
  grantedAllTime: number;
  spentAllTime: number;
  grantedLast7Days: number;
  spentLast7Days: number;
  estimatedProviderUsdAllTime: number;
  estimatedProviderUsdLast7Days: number;
  welcomeBurnedCount: number;
};

export type AdminUsageDashboard = {
  summary: AdminUsageSummary;
  accounts: AdminUsageAccountRow[];
};

const MS_PER_DAY = 86_400_000;
const INACTIVE_DAYS = 3;
const WELCOME_BURN_RATIO = 0.9;

function emptyBreakdown(): SpendBreakdown {
  return { video: 0, image: 0, sheet: 0, copilot: 0, other: 0 };
}

function toUtcDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function estimatedProviderUsd(committedCredits: number): number {
  return committedCredits / 2 / 10;
}

async function fetchAllRows<T>(
  table: "credit_ledger" | "profiles" | "credit_balances",
  select: string,
): Promise<T[]> {
  const admin = createAdminClient();
  const pageSize = 1000;
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    let query = admin.from(table).select(select);
    if (table === "credit_ledger" || table === "profiles") {
      query = query.order("created_at", { ascending: true });
    } else {
      query = query.order("user_id", { ascending: true });
    }

    const { data, error } = await query.range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load ${table}: ${error.message}`);
    }

    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

export async function getAdminUsageDashboard(): Promise<AdminUsageDashboard> {
  const [profiles, balances, ledger] = await Promise.all([
    fetchAllRows<ProfileRow>("profiles", "id, email, created_at"),
    fetchAllRows<BalanceRow>("credit_balances", "user_id, available, reserved"),
    fetchAllRows<LedgerRow>(
      "credit_ledger",
      "user_id, amount, type, status, reference, reservation_id, created_at",
    ),
  ]);

  const balanceByUser = new Map(balances.map((b) => [b.user_id, b]));
  const reservationRefById = new Map<string, string | null>();

  for (const row of ledger) {
    if (row.type === "reservation" && row.reservation_id) {
      reservationRefById.set(row.reservation_id, row.reference);
    }
  }

  const now = Date.now();
  const sevenDaysAgo = now - 7 * MS_PER_DAY;

  const signupsByDate = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * MS_PER_DAY);
    signupsByDate.set(d.toISOString().slice(0, 10), 0);
  }

  for (const profile of profiles) {
    const key = toUtcDateKey(profile.created_at);
    if (signupsByDate.has(key)) {
      signupsByDate.set(key, (signupsByDate.get(key) ?? 0) + 1);
    }
  }

  const signupsPerDay: SignupsPerDay[] = [...signupsByDate.entries()].map(([date, count]) => ({
    date,
    count,
  }));

  let grantedAllTime = 0;
  let spentAllTime = 0;
  let grantedLast7Days = 0;
  let spentLast7Days = 0;

  const ledgerByUser = new Map<string, LedgerRow[]>();
  for (const row of ledger) {
    const list = ledgerByUser.get(row.user_id) ?? [];
    list.push(row);
    ledgerByUser.set(row.user_id, list);

    const createdMs = new Date(row.created_at).getTime();
    if (row.type === "grant" && row.amount > 0) {
      grantedAllTime += row.amount;
      if (createdMs >= sevenDaysAgo) grantedLast7Days += row.amount;
    }
    if (row.type === "purchase" && row.amount > 0) {
      grantedAllTime += row.amount;
      if (createdMs >= sevenDaysAgo) grantedLast7Days += row.amount;
    }
    if (row.type === "commit" && row.amount < 0) {
      const spent = Math.abs(row.amount);
      spentAllTime += spent;
      if (createdMs >= sevenDaysAgo) spentLast7Days += spent;
    }
  }

  const accounts: AdminUsageAccountRow[] = profiles.map((profile) => {
    const entries = ledgerByUser.get(profile.id) ?? [];
    const balance = balanceByUser.get(profile.id);

    let creditsGrantedWelcome = 0;
    let creditsGrantedManual = 0;
    let creditsSpent = 0;
    let hasPurchase = false;
    let lastActivityAt: string | null = null;
    const spendByCategory = emptyBreakdown();

    for (const entry of entries) {
      if (!lastActivityAt || entry.created_at > lastActivityAt) {
        lastActivityAt = entry.created_at;
      }

      if (entry.type === "grant" && entry.amount > 0) {
        if (entry.reference === "signup:welcome") {
          creditsGrantedWelcome += entry.amount;
        } else {
          creditsGrantedManual += entry.amount;
        }
      }

      if (entry.type === "purchase" && entry.amount > 0) {
        hasPurchase = true;
        creditsGrantedManual += entry.amount;
      }

      if (entry.type === "commit" && entry.amount < 0) {
        const spent = Math.abs(entry.amount);
        creditsSpent += spent;
        const ref =
          entry.reference ??
          (entry.reservation_id ? reservationRefById.get(entry.reservation_id) : null) ??
          null;
        const category = categorizeSpendReference(ref);
        spendByCategory[category] += spent;
      }
    }

    if (creditsGrantedWelcome === 0 && entries.some((e) => e.type === "grant")) {
      creditsGrantedWelcome = SIGNUP_CREDIT_GRANT_AMOUNT;
    }

    const welcomeBaseline = creditsGrantedWelcome || SIGNUP_CREDIT_GRANT_AMOUNT;
    const inactiveMs = lastActivityAt
      ? now - new Date(lastActivityAt).getTime()
      : now - new Date(profile.created_at).getTime();
    const welcomeBurned =
      creditsSpent >= welcomeBaseline * WELCOME_BURN_RATIO &&
      !hasPurchase &&
      inactiveMs >= INACTIVE_DAYS * MS_PER_DAY;

    return {
      userId: profile.id,
      email: profile.email ?? profile.id.slice(0, 8),
      signupDate: profile.created_at,
      creditsGrantedWelcome,
      creditsGrantedManual,
      creditsGrantedTotal: creditsGrantedWelcome + creditsGrantedManual,
      creditsSpent,
      available: balance?.available ?? 0,
      reserved: balance?.reserved ?? 0,
      spendByCategory,
      lastActivityAt,
      welcomeBurned,
    };
  });

  accounts.sort((a, b) => b.creditsSpent - a.creditsSpent);

  const welcomeBurnedCount = accounts.filter((a) => a.welcomeBurned).length;

  return {
    summary: {
      signupsPerDay,
      grantedAllTime,
      spentAllTime,
      grantedLast7Days,
      spentLast7Days,
      estimatedProviderUsdAllTime: estimatedProviderUsd(spentAllTime),
      estimatedProviderUsdLast7Days: estimatedProviderUsd(spentLast7Days),
      welcomeBurnedCount,
    },
    accounts,
  };
}
