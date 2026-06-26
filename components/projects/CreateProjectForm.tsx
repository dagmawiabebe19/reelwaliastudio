"use client";

import { useActionState } from "react";
import { createProjectAction } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/Button";

const initialState = { error: undefined as string | undefined };

interface CreateProjectFormProps {
  submitLabel?: string;
}

export function CreateProjectForm({ submitLabel = "Create project" }: CreateProjectFormProps) {
  const [state, formAction, pending] = useActionState(
    async (_prev: typeof initialState, formData: FormData) => {
      const result = await createProjectAction(formData);
      if (result?.error) return { error: result.error };
      return { error: undefined };
    },
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="project-name" className="mb-2 block text-sm text-muted">
          Project name
        </label>
        <input
          id="project-name"
          name="name"
          type="text"
          required
          autoFocus
          placeholder="Untitled project"
          className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground outline-none ring-primary focus:ring-2"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : submitLabel}
      </Button>
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
