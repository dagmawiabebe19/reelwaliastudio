"use client";

type ViewMode = "classic" | "studio";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex rounded-md border border-border bg-surface p-1">
      {(["classic", "studio"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`rounded px-3 py-1.5 text-sm capitalize transition-colors ${
            value === mode
              ? "bg-primary text-primary-foreground"
              : "text-muted hover:text-accent"
          }`}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}
