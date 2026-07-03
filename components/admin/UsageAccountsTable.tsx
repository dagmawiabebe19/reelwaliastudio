"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCredits } from "@/lib/credits/format";
import type { AdminUsageAccountRow } from "@/lib/admin/usage-stats";

type SortKey =
  | "email"
  | "signupDate"
  | "granted"
  | "spent"
  | "available"
  | "reserved"
  | "video"
  | "image"
  | "sheet"
  | "copilot"
  | "lastActivity"
  | "flag";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso));
}

function compareRows(a: AdminUsageAccountRow, b: AdminUsageAccountRow, key: SortKey): number {
  switch (key) {
    case "email":
      return a.email.localeCompare(b.email);
    case "signupDate":
      return a.signupDate.localeCompare(b.signupDate);
    case "granted":
      return a.creditsGrantedTotal - b.creditsGrantedTotal;
    case "spent":
      return a.creditsSpent - b.creditsSpent;
    case "available":
      return a.available - b.available;
    case "reserved":
      return a.reserved - b.reserved;
    case "video":
      return a.spendByCategory.video - b.spendByCategory.video;
    case "image":
      return a.spendByCategory.image - b.spendByCategory.image;
    case "sheet":
      return a.spendByCategory.sheet - b.spendByCategory.sheet;
    case "copilot":
      return a.spendByCategory.copilot - b.spendByCategory.copilot;
    case "lastActivity":
      return (a.lastActivityAt ?? "").localeCompare(b.lastActivityAt ?? "");
    case "flag":
      return Number(a.welcomeBurned) - Number(b.welcomeBurned);
    default:
      return 0;
  }
}

interface UsageAccountsTableProps {
  accounts: AdminUsageAccountRow[];
}

export function UsageAccountsTable({ accounts }: UsageAccountsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("spent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...accounts];
    copy.sort((a, b) => {
      const cmp = compareRows(a, b, sortKey);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [accounts, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "email" || key === "signupDate" ? "asc" : "desc");
    }
  }

  function header(label: string, key: SortKey) {
    const active = sortKey === key;
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wide ${
          active ? "text-accent" : "text-muted hover:text-foreground"
        }`}
      >
        {label}
        {active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="border-b border-border bg-surface-elevated">
          <tr>
            <th>{header("Email", "email")}</th>
            <th>{header("Signed up", "signupDate")}</th>
            <th>{header("Granted", "granted")}</th>
            <th>{header("Spent", "spent")}</th>
            <th>{header("Balance", "available")}</th>
            <th>{header("Reserved", "reserved")}</th>
            <th>{header("Video", "video")}</th>
            <th>{header("Image", "image")}</th>
            <th>{header("Sheet", "sheet")}</th>
            <th>{header("Co-pilot", "copilot")}</th>
            <th>{header("Last active", "lastActivity")}</th>
            <th>{header("Flag", "flag")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((row) => (
            <tr key={row.userId} className="bg-surface hover:bg-surface-elevated/50">
              <td className="px-3 py-2">
                <Link
                  href={`/admin/usage/${row.userId}`}
                  className="font-medium text-accent hover:underline"
                >
                  {row.email}
                </Link>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-muted">
                {formatDate(row.signupDate)}
              </td>
              <td className="px-3 py-2 tabular-nums" title={`Welcome ${row.creditsGrantedWelcome} · Manual ${row.creditsGrantedManual}`}>
                {formatCredits(row.creditsGrantedTotal)}
              </td>
              <td className="px-3 py-2 tabular-nums text-foreground">
                {formatCredits(row.creditsSpent)}
              </td>
              <td className="px-3 py-2 tabular-nums">{formatCredits(row.available)}</td>
              <td className="px-3 py-2 tabular-nums text-muted">
                {row.reserved > 0 ? formatCredits(row.reserved) : "—"}
              </td>
              <td className="px-3 py-2 tabular-nums text-muted">
                {row.spendByCategory.video > 0 ? formatCredits(row.spendByCategory.video) : "—"}
              </td>
              <td className="px-3 py-2 tabular-nums text-muted">
                {row.spendByCategory.image > 0 ? formatCredits(row.spendByCategory.image) : "—"}
              </td>
              <td className="px-3 py-2 tabular-nums text-muted">
                {row.spendByCategory.sheet > 0 ? formatCredits(row.spendByCategory.sheet) : "—"}
              </td>
              <td className="px-3 py-2 tabular-nums text-muted">
                {row.spendByCategory.copilot > 0 ? formatCredits(row.spendByCategory.copilot) : "—"}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-muted">
                {formatDate(row.lastActivityAt)}
              </td>
              <td className="px-3 py-2">
                {row.welcomeBurned ? (
                  <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    welcome-burned
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
