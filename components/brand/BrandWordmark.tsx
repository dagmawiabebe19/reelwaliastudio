import Link from "next/link";

interface BrandWordmarkProps {
  size?: "default" | "compact";
  className?: string;
  onNavigate?: () => void;
}

export function BrandWordmark({
  size = "default",
  className = "",
  onNavigate,
}: BrandWordmarkProps) {
  const titleClass = size === "compact" ? "text-lg leading-none" : "text-2xl";
  const kickerClass = size === "compact" ? "text-[9px] tracking-[0.18em]" : "text-xs tracking-[0.2em]";

  return (
    <Link
      href="/"
      onClick={onNavigate}
      className={`block shrink-0 transition-opacity hover:opacity-90 ${className}`}
      aria-label="ReelWalia Studio home"
    >
      <p className={`brand-wordmark font-display font-bold tracking-tight ${titleClass}`}>
        <span className="text-foreground">Reel</span>
        <span className="text-accent">Walia</span>
      </p>
      <p className={`mt-0.5 font-semibold uppercase text-muted ${kickerClass}`}>Studio</p>
    </Link>
  );
}
