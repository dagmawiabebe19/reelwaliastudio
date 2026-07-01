"use client";

import { useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Sparkles, X } from "lucide-react";
import { useCopilotWorkspace } from "@/components/copilot/CopilotWorkspaceProvider";
import { completeOnboardingAction } from "@/lib/onboarding/actions";
import {
  ONBOARDING_COPY,
  ONBOARDING_COPILOT_DRAFTS,
  ONBOARDING_STEPS,
  type OnboardingPhase,
} from "@/lib/onboarding/constants";
import { Button } from "@/components/ui/Button";
import { ICON_SM, ICON_STROKE } from "@/components/ui/icon";

interface OnboardingGuideProps {
  phase: OnboardingPhase;
  primaryAction?: ReactNode;
  className?: string;
}

export function OnboardingGuide({ phase, primaryAction, className = "" }: OnboardingGuideProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { setCopilotDraft, setCollapsed, active: copilotActive } = useCopilotWorkspace();

  const copy = ONBOARDING_COPY[phase];
  const draftPrompt = ONBOARDING_COPILOT_DRAFTS[phase];

  function finish() {
    startTransition(async () => {
      const result = await completeOnboardingAction();
      if ("error" in result) {
        console.warn("[onboarding]", result.error);
      }
      router.refresh();
    });
  }

  function handleShowMeHow() {
    if (!draftPrompt) return;
    setCopilotDraft(draftPrompt);
    setCollapsed(false);
  }

  return (
    <div
      className={`studio-onboarding rounded-lg border border-accent-subtle bg-accent-subtle/40 px-5 py-5 ${className}`}
      role="region"
      aria-label="Getting started"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            <Sparkles className={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
            {copy.welcome}
          </p>
          <p className="mt-1 font-display text-lg tracking-wide text-foreground">{copy.headline}</p>
        </div>
        <button
          type="button"
          onClick={finish}
          disabled={pending}
          className="focus-ring studio-icon-btn shrink-0 !border-transparent !bg-transparent text-muted hover:text-foreground"
          aria-label="Skip onboarding"
        >
          <X className={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
        </button>
      </div>

      <ol className="mb-5 space-y-2">
        {ONBOARDING_STEPS.map((step, index) => {
          const isActive = index === copy.activeStep;
          return (
            <li
              key={step.title}
              className={`flex gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                isActive
                  ? "border-accent/30 bg-surface-elevated/80"
                  : "border-border/50 bg-background/20"
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface-raised text-muted"
                }`}
              >
                {index < copy.activeStep ? (
                  <Check className="size-3" strokeWidth={2.5} aria-hidden />
                ) : (
                  index + 1
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{step.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                  {step.description}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {primaryAction}
        {draftPrompt && copilotActive ? (
          <Button type="button" variant="secondary" disabled={pending} onClick={handleShowMeHow}>
            Show me how
          </Button>
        ) : null}
        <Button type="button" variant="ghost" disabled={pending} onClick={finish}>
          Got it
        </Button>
      </div>
    </div>
  );
}

export function OnboardingPrimaryLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href}>
      <Button type="button">{children}</Button>
    </Link>
  );
}
