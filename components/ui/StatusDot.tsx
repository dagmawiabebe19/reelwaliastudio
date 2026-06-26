export type StatusVariant = "open" | "in_progress" | "validated" | "released";

const variantClasses: Record<StatusVariant, string> = {
  open: "bg-status-open",
  in_progress: "bg-status-progress",
  validated: "bg-status-validated",
  released: "bg-status-released",
};

interface StatusDotProps {
  variant: StatusVariant;
  label?: string;
  className?: string;
}

export function StatusDot({ variant, label, className = "" }: StatusDotProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${variantClasses[variant]}`}
        aria-hidden="true"
      />
      {label ? <span className="text-sm text-muted">{label}</span> : null}
    </span>
  );
}
