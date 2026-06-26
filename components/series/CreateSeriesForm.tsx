"use client";

import { useActionState } from "react";
import { createSeriesAction } from "@/app/(app)/projects/[id]/actions";
import { Button } from "@/components/ui/Button";

interface CreateSeriesFormProps {
  projectId: string;
}

const initialState = { error: undefined as string | undefined };

export function CreateSeriesForm({ projectId }: CreateSeriesFormProps) {
  const [state, formAction, pending] = useActionState(
    async (_prev: typeof initialState, formData: FormData) => {
      return createSeriesAction(projectId, formData);
    },
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-border bg-surface p-6">
      <div>
        <label htmlFor="series-title" className="mb-2 block text-sm text-muted">
          New series
        </label>
        <input
          id="series-title"
          name="title"
          type="text"
          required
          placeholder="Untitled series"
          className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground outline-none ring-primary focus:ring-2"
        />
      </div>
      <div>
        <label htmlFor="series-slug" className="mb-2 block text-sm text-muted">
          Slug <span className="text-xs">(optional — auto-generated from title)</span>
        </label>
        <input
          id="series-slug"
          name="slug"
          type="text"
          placeholder="my-series"
          className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 font-mono text-sm text-foreground outline-none ring-primary focus:ring-2"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create series"}
      </Button>
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
