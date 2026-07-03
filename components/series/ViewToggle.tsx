"use client";

type ViewMode = "classic" | "studio";

const VIEW_OPTIONS: { value: ViewMode; label: string; hint: string }[] = [
  {
    value: "classic",
    label: "Overview",
    hint: "Ingredients, episodes, brief, and memory tabs",
  },
  {
    value: "studio",
    label: "Studio",
    hint: "Co-pilot output gallery for this series",
  },
];

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div
      className="inline-flex rounded-md border border-border bg-surface p-1"
      role="group"
      aria-label="Series view"
    >
      {VIEW_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.hint}
          onClick={() => onChange(option.value)}
          className={`rounded px-3 py-1.5 text-sm transition-colors ${
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted hover:text-accent"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
