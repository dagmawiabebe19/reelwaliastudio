export function StudioShell() {
  return (
    <div className="grid h-[calc(100vh-12rem)] grid-cols-2 gap-4 rounded-lg border border-border bg-surface">
      <div className="flex flex-col border-r border-border p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Co-pilot</p>
        <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
          <p className="font-display text-xl text-foreground">Co-pilot pane</p>
          <p className="mt-2 max-w-xs text-sm text-muted">
            Claude tool-use drafting arrives in Prompt 3. Storyboard context will stream here.
          </p>
        </div>
      </div>
      <div className="flex flex-col p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Scene + Takes
        </p>
        <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
          <p className="font-display text-xl text-foreground">Generation pane</p>
          <p className="mt-2 max-w-xs text-sm text-muted">
            Image and video takes will render here with multi-model generation controls.
          </p>
        </div>
      </div>
    </div>
  );
}
