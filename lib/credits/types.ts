export type CreditLedgerType =
  | "purchase"
  | "reservation"
  | "commit"
  | "refund"
  | "grant"
  | "adjustment";

export type CreditLedgerStatus = "reserved" | "settled" | "released";

export type CreditBalance = {
  available: number;
  reserved: number;
};

export type CreditLedgerEntry = {
  id: string;
  user_id: string;
  amount: number;
  balance_after: number;
  type: CreditLedgerType;
  status: CreditLedgerStatus;
  reservation_id: string | null;
  reference: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};
