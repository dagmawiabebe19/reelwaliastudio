export type OnboardingPhase =
  | "create-project"
  | "create-series"
  | "plan-episode"
  | "studio-segments";

export const ONBOARDING_STEPS = [
  {
    title: "Create a project & series",
    description: "Organize your show — portrait 9:16 or landscape 16:9.",
  },
  {
    title: "Generate characters & ingredients",
    description: "Ask the co-pilot to create headshots, locations, and voices.",
  },
  {
    title: "Plan, lock, then generate",
    description: "Let the co-pilot break down an episode; you approve video in the studio.",
  },
] as const;

export const ONBOARDING_COPY: Record<
  OnboardingPhase,
  { welcome: string; headline: string; activeStep: number }
> = {
  "create-project": {
    welcome: "Welcome to ReelWalia Studio",
    headline: "Create your first project to get started.",
    activeStep: 0,
  },
  "create-series": {
    welcome: "Welcome to ReelWalia Studio",
    headline: "Create your first series in this project.",
    activeStep: 0,
  },
  "plan-episode": {
    welcome: "You're almost there",
    headline: "Plan your first episode with the co-pilot.",
    activeStep: 2,
  },
  "studio-segments": {
    welcome: "Episode studio",
    headline: "Ask the co-pilot to plan segments for this episode.",
    activeStep: 2,
  },
};

export const ONBOARDING_COPILOT_DRAFTS: Partial<Record<OnboardingPhase, string>> = {
  "create-series":
    "Help me set up my first series — suggest a brief, main characters, and a visual style.",
  "plan-episode": "Help me plan my first episode for this series.",
  "studio-segments":
    "Help me break down this episode into storyboard segments with characters and locations.",
};
