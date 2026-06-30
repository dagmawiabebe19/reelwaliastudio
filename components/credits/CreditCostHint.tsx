import { formatCredits } from "@/lib/credits/format";

interface CreditCostHintProps {
  cost: number;
  available: number | null;
  isAdmin?: boolean;
  label?: string;
}

export function CreditCostHint({ cost, available, isAdmin = false, label }: CreditCostHintProps) {
  if (cost <= 0) return null;

  const affordable = isAdmin || available == null || available >= cost;

  return (
    <p
      className={`text-xs leading-relaxed ${affordable ? "text-muted" : "text-red-600"}`}
    >
      {label ? `${label} ` : ""}
      ≈ {formatCredits(cost)} credit{cost === 1 ? "" : "s"}
      {isAdmin ? (
        <span className="text-accent"> · Admin — unlimited</span>
      ) : available != null ? (
        <>
          {" "}
          · You have {formatCredits(available)}
        </>
      ) : null}
    </p>
  );
}
