interface RefTagProps {
  tag: string;
  className?: string;
}

export function RefTag({ tag, className = "" }: RefTagProps) {
  const normalized = tag.startsWith("[") ? tag : `[${tag}]`;

  return (
    <span
      className={`inline-flex items-center rounded border border-border bg-surface-elevated px-1.5 py-0.5 font-mono text-xs text-foreground ${className}`}
    >
      {normalized}
    </span>
  );
}
