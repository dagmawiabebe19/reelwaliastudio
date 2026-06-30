import { formatCredits } from "@/lib/credits/format";

interface CreditCostHintProps {
  cost: number;
  available: number | null;
  label?: string;
}

export function CreditCostHint({ cost, available, label }: CreditCostHintProps) {
  if (cost <= 0) return null;

  const affordable = available == null || available >= cost;

  return (
    <p
      className={`text-xs leading-relaxed ${affordable ? "text-muted" : "text-red-600"}`}
    >
      {label ? `${label} ` : ""}
      ≈ {formatCredits(cost)} credit{cost === 1 ? "" : "s"}
      {available != null ? (
        <>
          {" "}
          · You have {formatCredits(available)}
        </>
      ) : null}
    </p>
  );
}
