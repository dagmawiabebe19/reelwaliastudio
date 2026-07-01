"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookMarked,
  Check,
  Clapperboard,
  ImagePlus,
  LayoutGrid,
  Library,
  Link2,
  Loader2,
  MapPin,
  Shirt,
  Sparkles,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import type { ChatMessageData } from "@/components/series/copilot/CopilotPane";
import { ICON_SM, ICON_STROKE } from "@/components/ui/icon";
import {
  formatToolDebugLine,
  friendlyParallelRunning,
  friendlyToolDone,
  friendlyToolRunning,
  inferToolStatus,
  type ToolStatusContext,
  type ToolStatusIconKey,
} from "@/lib/copilot/tool-status";

const ICONS: Record<ToolStatusIconKey, LucideIcon> = {
  sparkles: Sparkles,
  "image-plus": ImagePlus,
  "layout-grid": LayoutGrid,
  link: Link2,
  clapperboard: Clapperboard,
  "book-marked": BookMarked,
  "map-pin": MapPin,
  shirt: Shirt,
  "volume-2": Volume2,
  library: Library,
  loader: Loader2,
  check: Check,
};

function StatusIcon({
  iconKey,
  className = "",
}: {
  iconKey: ToolStatusIconKey;
  className?: string;
}) {
  const Icon = ICONS[iconKey];
  return <Icon className={`${ICON_SM} shrink-0 ${className}`} strokeWidth={ICON_STROKE} aria-hidden />;
}

interface CopilotToolActivityProps {
  tools: ChatMessageData[];
  streaming: boolean;
  statusContext?: ToolStatusContext;
  onDismiss?: () => void;
}

export function CopilotToolActivity({
  tools,
  streaming,
  statusContext = {},
  onDismiss,
}: CopilotToolActivityProps) {
  const [resolvedVisible, setResolvedVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const steps = useMemo(
    () =>
      tools.map((tool) => {
        const status = inferToolStatus(tool);
        const label =
          status === "running"
            ? friendlyToolRunning(tool.tool_name ?? "", tool.tool_args, statusContext, {
                step: tool.step,
                total: tool.total,
              })
            : friendlyToolDone(tool.tool_name ?? "", tool.tool_args, tool.tool_result, statusContext);

        return {
          id: tool.id,
          status,
          label,
          debug: formatToolDebugLine(
            tool.tool_name,
            tool.content,
            tool.tool_args,
            tool.tool_result,
          ),
        };
      }),
    [tools, statusContext],
  );

  const runningIndex = steps.findIndex((step) => step.status === "running");
  const runningSteps = steps.filter((step) => step.status === "running");
  const parallelLabel = friendlyParallelRunning(
    runningSteps.map((step) => {
      const tool = tools.find((item) => item.id === step.id);
      return { name: tool?.tool_name ?? "", args: tool?.tool_args };
    }),
  );
  const allDone = steps.length > 0 && runningIndex === -1;
  const showActivity = steps.length > 0 && (streaming || resolvedVisible);

  useEffect(() => {
    if (streaming) {
      setResolvedVisible(true);
      setFadeOut(false);
      return;
    }
    if (allDone && steps.length > 0) {
      setResolvedVisible(true);
      setFadeOut(false);
      const timer = window.setTimeout(() => setFadeOut(true), 2200);
      const hide = window.setTimeout(() => {
        setResolvedVisible(false);
        onDismiss?.();
      }, 2800);
      return () => {
        window.clearTimeout(timer);
        window.clearTimeout(hide);
      };
    }
    if (!streaming && runningIndex === -1 && steps.length === 0) {
      setResolvedVisible(false);
    }
  }, [streaming, allDone, steps.length, runningIndex, onDismiss]);

  if (!showActivity || steps.length === 0) return null;

  const completed = runningIndex === -1 ? steps : steps.slice(0, runningIndex);
  const current = runningIndex >= 0 ? steps[runningIndex] : null;
  const displayCurrent = parallelLabel ?? current?.label ?? null;
  const multiStep = steps.length > 1;

  return (
    <div
      className={`copilot-tool-activity rounded-lg border border-border/80 bg-surface-elevated px-3 py-2.5 transition-opacity duration-200 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
      role="status"
      aria-live="polite"
      aria-busy={streaming && Boolean(displayCurrent)}
    >
      {allDone && !streaming ? (
        <div className="flex items-center gap-2 text-xs text-foreground-secondary">
          <Check className={`${ICON_SM} shrink-0 text-status-released`} strokeWidth={ICON_STROKE} aria-hidden />
          <span>
            {steps.length === 1
              ? steps[0].label.message
              : `${steps.length} steps completed`}
          </span>
        </div>
      ) : (
        <>
          {multiStep && completed.length > 0 ? (
            <ul className="mb-2 space-y-1 border-b border-border/50 pb-2">
              {completed.map((step) => (
                <li
                  key={step.id}
                  className={`flex items-center gap-2 text-xs ${
                    step.label.failed ? "text-accent" : "text-foreground-tertiary"
                  }`}
                >
                  <Check
                    className={`${ICON_SM} shrink-0 ${
                      step.label.failed ? "text-accent" : "text-status-released/80"
                    }`}
                    strokeWidth={ICON_STROKE}
                    aria-hidden
                  />
                  <span>{step.label.message}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {displayCurrent ? (
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Loader2
                className={`${ICON_SM} copilot-status-spinner shrink-0 text-accent`}
                strokeWidth={ICON_STROKE}
                aria-hidden
              />
              <StatusIcon iconKey={displayCurrent.icon} className="text-foreground-secondary" />
              <span className="min-w-0 truncate">{displayCurrent.message}</span>
            </div>
          ) : null}
        </>
      )}

      <details className="mt-2 group">
        <summary className="cursor-pointer text-[10px] text-foreground-tertiary transition-colors hover:text-muted">
          Technical details
        </summary>
        <pre className="mt-1.5 max-h-32 overflow-auto rounded-md border border-border/60 bg-background/60 p-2 font-mono text-[10px] leading-relaxed text-muted">
          {steps.map((step) => step.debug).join("\n\n---\n\n")}
        </pre>
      </details>
    </div>
  );
}
