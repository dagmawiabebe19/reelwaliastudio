"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { CreateSeriesForm } from "@/components/series/CreateSeriesForm";
import { Button } from "@/components/ui/Button";

interface CollapsibleCreateSeriesFormProps {
  projectId: string;
  defaultExpanded?: boolean;
}

export function CollapsibleCreateSeriesForm({
  projectId,
  defaultExpanded = false,
}: CollapsibleCreateSeriesFormProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#create-series-form") {
      setExpanded(true);
    }
  }, []);

  if (!expanded) {
    return (
      <Button type="button" onClick={() => setExpanded(true)} className="gap-2">
        <Plus className="size-4" strokeWidth={1.75} aria-hidden />
        New series
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <CreateSeriesForm projectId={projectId} />
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="text-sm text-muted hover:text-accent"
      >
        Cancel
      </button>
    </div>
  );
}
