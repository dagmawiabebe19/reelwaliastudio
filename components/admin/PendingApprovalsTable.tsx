"use client";

import { useState, useTransition } from "react";
import { approveUserAction, rejectUserAction } from "@/lib/admin/approval-actions";
import type { PendingApprovalAccount } from "@/lib/admin/approvals";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type PendingApprovalsTableProps = {
  accounts: PendingApprovalAccount[];
};

export function PendingApprovalsTable({ accounts }: PendingApprovalsTableProps) {
  const [rows, setRows] = useState(accounts);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function removeRow(userId: string) {
    setRows((current) => current.filter((row) => row.id !== userId));
  }

  function handleApprove(userId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await approveUserAction(userId);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      removeRow(userId);
    });
  }

  function handleReject(userId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await rejectUserAction(userId);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      removeRow(userId);
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted">No accounts waiting for approval.</p>;
  }

  return (
    <div className="space-y-4">
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-elevated text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Signed up</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3 text-foreground">{row.email ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{row.displayName ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{formatDate(row.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleApprove(row.id)}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleReject(row.id)}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-elevated disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
