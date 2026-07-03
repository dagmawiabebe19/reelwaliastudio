import "server-only";

/** Owner account — never gated under any circumstance. */
export const OWNER_EMAIL = "dagmawiabebe19@gmail.com";
export const OWNER_USER_ID = "aade471f-9614-46b5-8238-53225c78b0f6";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type UserApprovalProfile = {
  approvalStatus: ApprovalStatus;
  isAdmin: boolean;
};

export function isOwnerAccount(input: { id: string; email?: string | null }): boolean {
  if (input.id === OWNER_USER_ID) return true;
  if (input.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()) return true;
  return false;
}
