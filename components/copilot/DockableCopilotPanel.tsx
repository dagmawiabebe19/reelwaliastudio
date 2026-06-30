"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutPanelLeft,
  Lightbulb,
  Minus,
  PanelLeft,
  PanelRight,
  PictureInPicture2,
  X,
} from "lucide-react";
import { CopilotPane, type ChatMessageData } from "@/components/series/copilot/CopilotPane";
import { useCopilotWorkspace } from "@/components/copilot/CopilotWorkspaceProvider";
import { CanonMemoryPrompt } from "@/components/copilot/CanonMemoryPrompt";
import { ICON_SM, ICON_STROKE } from "@/components/ui/icon";

function PanelChrome({
  body,
  onCollapse,
  dock,
  mode,
  onDockChange,
  onModeChange,
  viewLabel,
}: {
  body: React.ReactNode;
  onCollapse: () => void;
  dock: "left" | "right";
  mode: "docked" | "float";
  onDockChange: (dock: "left" | "right") => void;
  onModeChange: (mode: "docked" | "float") => void;
  viewLabel?: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Co-pilot</p>
          {viewLabel ? (
            <p className="truncate text-[11px] text-foreground/80" title={viewLabel}>
              {viewLabel}
            </p>
          ) : null}
        </div>
        <div className="studio-toolbar shrink-0">
          <button
            type="button"
            onClick={() => onDockChange(dock === "left" ? "right" : "left")}
            className="studio-toolbar-btn"
            title="Switch dock side"
            aria-label="Switch dock side"
          >
            {dock === "left" ? (
              <PanelRight className={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
            ) : (
              <PanelLeft className={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={() => onModeChange(mode === "docked" ? "float" : "docked")}
            className="studio-toolbar-btn"
            title={mode === "docked" ? "Float panel" : "Dock panel"}
            aria-label={mode === "docked" ? "Float panel" : "Dock panel"}
          >
            {mode === "docked" ? (
              <PictureInPicture2 className={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
            ) : (
              <LayoutPanelLeft className={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={onCollapse}
            className="studio-toolbar-btn"
            title="Collapse co-pilot"
            aria-label="Collapse co-pilot"
          >
            <Minus className={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>
    </div>
  );
}

export function DockableCopilotPanel() {
  const {
    active,
    scopeType,
    scopeId,
    context,
    ingredients,
    suggestions,
    prefs,
    setCollapsed,
    setDock,
    setMode,
    setWidth,
    setFloatPosition,
    dismissSuggestion,
    getLiveContext,
    outputHandlerRef,
    messagesVersion,
    bumpMessages,
  } = useCopilotWorkspace();

  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const loadHistory = useCallback(async () => {
    if (!scopeType || !scopeId) {
      setMessages([]);
      return;
    }
    setLoadingHistory(true);
    try {
      const response = await fetch(
        `/api/copilot?scopeType=${scopeType}&scopeId=${encodeURIComponent(scopeId)}`,
      );
      if (!response.ok) return;
      const data = (await response.json()) as { messages: ChatMessageData[] };
      setMessages(data.messages ?? []);
    } finally {
      setLoadingHistory(false);
    }
  }, [scopeType, scopeId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, messagesVersion]);

  const handleOutputEvent = useCallback(
    (event: Parameters<NonNullable<typeof outputHandlerRef.current>>[0]) => {
      outputHandlerRef.current?.(event);
    },
    [outputHandlerRef],
  );

  if (!active || prefs.collapsed) return null;

  const messageBanner =
    scopeType && scopeId && context ? (
      <>
        {suggestions.length > 0
          ? suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-xs text-amber-100/90"
              >
                <Lightbulb className={`${ICON_SM} shrink-0 text-amber-400`} strokeWidth={ICON_STROKE} aria-hidden />
                <p className="min-w-0 flex-1">{suggestion.message}</p>
                <button
                  type="button"
                  onClick={() => dismissSuggestion(suggestion.id)}
                  className="focus-ring studio-icon-btn !min-h-6 !min-w-6 shrink-0 !border-transparent !bg-transparent"
                  aria-label="Dismiss suggestion"
                >
                  <X className={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
                </button>
              </div>
            ))
          : null}
        <CanonMemoryPrompt
          seriesId={context.seriesId}
          messages={messages}
          onSaved={bumpMessages}
        />
      </>
    ) : null;

  const panelBody = !scopeType || !scopeId || !context ? (
    <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted">
      Open a series to start working with the co-pilot.
    </div>
  ) : loadingHistory ? (
    <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted">Loading…</div>
  ) : (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2">
      <CopilotPane
        scopeType={scopeType}
        scopeId={scopeId}
        context={context}
        ingredients={ingredients}
        initialMessages={messages}
        controlledMessages={messages}
        onMessagesChange={setMessages}
        getLiveContext={getLiveContext}
        onOutputEvent={handleOutputEvent}
        messageBanner={messageBanner}
        className="min-h-0 flex-1"
      />
    </div>
  );

  const chrome = (
    <PanelChrome
      onCollapse={() => setCollapsed(true)}
      dock={prefs.dock}
      mode={prefs.mode}
      onDockChange={setDock}
      onModeChange={setMode}
      viewLabel={context?.workspace?.viewLabel}
      body={panelBody}
    />
  );

  if (prefs.mode === "float") {
    return (
      <div
        className="fixed z-50 flex h-[min(720px,calc(100dvh-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
        style={{
          width: prefs.width,
          left: prefs.floatX,
          top: prefs.floatY,
        }}
      >
        <div
          className="shrink-0 cursor-move border-b border-border px-3 py-1 text-[10px] text-muted"
          onPointerDown={(e) => {
            dragRef.current = {
              startX: e.clientX,
              startY: e.clientY,
              originX: prefs.floatX,
              originY: prefs.floatY,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!dragRef.current) return;
            const dx = e.clientX - dragRef.current.startX;
            const dy = e.clientY - dragRef.current.startY;
            setFloatPosition(dragRef.current.originX + dx, dragRef.current.originY + dy);
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
        >
          Drag to move
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{chrome}</div>
      </div>
    );
  }

  return (
    <aside
      className={`relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-border bg-surface ${
        prefs.dock === "left" ? "border-r" : "border-l"
      }`}
      style={{ width: prefs.width }}
    >
      <div
        className={`absolute top-0 bottom-0 z-10 w-1 cursor-col-resize hover:bg-accent/30 ${
          prefs.dock === "left" ? "right-0" : "left-0"
        }`}
        onPointerDown={(e) => {
          resizeRef.current = { startX: e.clientX, startWidth: prefs.width };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!resizeRef.current) return;
          const delta =
            prefs.dock === "right"
              ? resizeRef.current.startX - e.clientX
              : e.clientX - resizeRef.current.startX;
          setWidth(Math.min(560, Math.max(300, resizeRef.current.startWidth + delta)));
        }}
        onPointerUp={() => {
          resizeRef.current = null;
        }}
      />
      {chrome}
    </aside>
  );
}
