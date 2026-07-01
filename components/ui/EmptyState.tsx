import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ICON_LG, ICON_STROKE } from "@/components/ui/icon";

export type EmptyStateVariant = "inline" | "panel" | "preview" | "list";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: EmptyStateVariant;
  className?: string;
}

const variantShell: Record<EmptyStateVariant, string> = {
  inline: "py-4 text-center",
  panel: "rounded-lg border border-border/80 bg-surface-elevated/50 px-6 py-8 text-center",
  preview: "studio-empty-preview",
  list: "rounded-lg border border-dashed border-border px-8 py-16 text-center",
};

const variantIcon: Record<EmptyStateVariant, string> = {
  inline: "mb-2",
  panel: "mb-3",
  preview: "mb-2",
  list: "mb-4",
};

const variantTitle: Record<EmptyStateVariant, string> = {
  inline: "text-sm font-medium text-foreground",
  panel: "font-display text-base tracking-wide text-foreground",
  preview: "font-display text-sm tracking-wide text-foreground",
  list: "font-display text-2xl text-foreground",
};

const variantDescription: Record<EmptyStateVariant, string> = {
  inline: "mt-1 text-xs leading-relaxed text-muted",
  panel: "mt-1.5 max-w-sm mx-auto text-sm leading-relaxed text-muted",
  preview: "mt-1 max-w-xs text-sm leading-relaxed text-muted",
  list: "mt-3 max-w-md mx-auto text-sm leading-relaxed text-muted",
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "panel",
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`${variantShell[variant]} ${className}`}>
      {Icon ? (
        <div className={`flex justify-center ${variantIcon[variant]}`}>
          <Icon
            className={`${ICON_LG} text-muted/70`}
            strokeWidth={ICON_STROKE}
            aria-hidden
          />
        </div>
      ) : null}
      <p className={variantTitle[variant]}>{title}</p>
      {description ? <p className={variantDescription[variant]}>{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
