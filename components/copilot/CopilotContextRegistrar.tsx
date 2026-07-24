"use client";

import { useEffect, useRef } from "react";
import { useCopilotRegister } from "@/components/copilot/CopilotWorkspaceProvider";
import { registrationSignature } from "@/lib/copilot/registration-signature";
import type { CopilotRegistration } from "@/lib/copilot/workspace-types";

/**
 * Registers copilot context without subscribing StudioShell to the full
 * workspace value (prefs / messagesVersion / streaming-driven bumps).
 * Uses the register-only context so studio layout stays isolated.
 */
export function CopilotContextRegistrar({
  registration,
}: {
  registration: CopilotRegistration | null;
}): null {
  const { register } = useCopilotRegister();
  const registrationRef = useRef(registration);
  registrationRef.current = registration;

  const signature = registrationSignature(registration);

  useEffect(() => {
    register(registrationRef.current);
    return () => register(null);
  }, [register, signature]);

  return null;
}
