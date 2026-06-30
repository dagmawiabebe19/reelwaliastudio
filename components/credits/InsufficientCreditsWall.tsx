import Link from "next/link";
import { formatCredits } from "@/lib/credits/format";

interface InsufficientCreditsWallProps {
  needed: number;
  available: number;
  className?: string;
}

export function InsufficientCreditsWall({
  needed,
  available,
  className = "",
}: InsufficientCreditsWallProps) {
  return (
    <div
      className={`rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm ${className}`}
      role="alert"
    >
      <p className="font-medium text-foreground">Not enough credits</p>
      <p className="mt-1 text-muted">
        This action needs {formatCredits(needed)} credits; you have{" "}
        {formatCredits(available)} available.
      </p>
      <p className="mt-2 text-muted">
        <Link href="/credits" className="text-accent hover:underline">
          View balance & history
        </Link>
        {" · "}
        Purchases coming soon.
      </p>
    </div>
  );
}
