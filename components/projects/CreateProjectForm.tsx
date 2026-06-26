"use client";

import { useActionState } from "react";
import { createProjectAction } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/Button";

const initialState = { error: undefined as string | undefined, success: false };

export function CreateProjectForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: typeof initialState, formData: FormData) => {
      const result = await createProjectAction(formData);
      if (result.error) return { error: result.error, success: false };
      return { error: undefined, success: true };
    },
    initialState,
  );

  return (
    <form action={formAction} className="flex items-end gap-3">
      <div className="flex-1">
        <label htmlFor="project-name" className="mb-2 block text-sm text-muted">
          New project
        </label>
        <input
          id="project-name"
          name="name"
          type="text"
          required
          placeholder="Untitled project"
          className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground outline-none ring-primary focus:ring-2"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create"}
      </Button>
      {state.error ? (
        <p className="self-center text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="self-center text-sm text-muted" role="status">
          Created.
        </p>
      ) : null}
    </form>
  );
}
