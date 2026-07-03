"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { ICON_MD, ICON_STROKE } from "@/components/ui/icon";

interface ThemeToggleProps {
  /** Sidebar footer button (default) or compact toolbar icon. */
  variant?: "sidebar" | "compact";
  className?: string;
}

export function ThemeToggle({ variant = "sidebar", className = "" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const label = theme === "light" ? "Switch to dark mode" : "Switch to light mode";

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`studio-toolbar-btn ${className}`.trim()}
        aria-label={label}
        title={label}
      >
        {theme === "light" ? (
          <Moon className={ICON_MD} strokeWidth={ICON_STROKE} aria-hidden />
        ) : (
          <Sun className={ICON_MD} strokeWidth={ICON_STROKE} aria-hidden />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`w-full rounded-md border border-border px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-surface-elevated hover:text-accent ${className}`.trim()}
      aria-label={label}
    >
      {theme === "light" ? "Dark mode" : "Light mode"}
    </button>
  );
}
