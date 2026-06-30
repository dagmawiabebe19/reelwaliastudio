import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  danger?: boolean;
  label: string;
}

export function IconButton({
  children,
  danger = false,
  label,
  className = "",
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`focus-ring studio-icon-btn ${danger ? "studio-icon-btn--danger" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
