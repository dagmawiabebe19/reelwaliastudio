import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "studio-btn studio-btn-primary",
  secondary: "studio-btn studio-btn-secondary",
  ghost: "studio-btn studio-btn-ghost",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`focus-ring ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
