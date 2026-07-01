"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { parseStudioRoute } from "@/lib/copilot/parse-route";
import { loadCopilotPanelPrefs, saveCopilotPanelPrefs } from "@/lib/copilot/panel-prefs";
import { registrationSignature } from "@/lib/copilot/registration-signature";
import {
  DEFAULT_COPILOT_PANEL_PREFS,
  type CopilotPanelPrefs,
  type CopilotRegistration,
  type CopilotScopeType,
  type CopilotSuggestion,
} from "@/lib/copilot/workspace-types";
import type { CopilotContextPayload, MentionIngredient } from "@/components/series/copilot/CopilotPane";
import type { CopilotOutputEvent } from "@/lib/copilot/output";

type CopilotWorkspaceContextValue = {
  active: boolean;
  scopeType: CopilotScopeType | null;
  scopeId: string | null;
  context: CopilotContextPayload | null;
  ingredients: MentionIngredient[];
  suggestions: CopilotSuggestion[];
  prefs: CopilotPanelPrefs;
  messagesVersion: number;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
  setDock: (dock: CopilotPanelPrefs["dock"]) => void;
  setMode: (mode: CopilotPanelPrefs["mode"]) => void;
  setWidth: (width: number) => void;
  setFloatPosition: (x: number, y: number) => void;
  dismissSuggestion: (id: string) => void;
  copilotDraft: string | null;
  setCopilotDraft: (text: string | null) => void;
  getLiveContext: () => CopilotContextPayload | null;
  outputHandlerRef: React.MutableRefObject<((event: CopilotOutputEvent) => void) | null>;
  register: (registration: CopilotRegistration | null) => void;
  bumpMessages: () => void;
};

const CopilotWorkspaceContext = createContext<CopilotWorkspaceContextValue | null>(null);

export function useCopilotWorkspace(): CopilotWorkspaceContextValue {
  const value = useContext(CopilotWorkspaceContext);
  if (!value) {
    throw new Error("useCopilotWorkspace must be used within CopilotWorkspaceProvider");
  }
  return value;
}

export function useRegisterCopilotContext(registration: CopilotRegistration | null): void {
  const { register } = useCopilotWorkspace();
  const registrationRef = useRef(registration);
  registrationRef.current = registration;

  const ingredientIds = registration?.ingredients.map((i) => i.id).join(",") ?? "";
  const suggestionIds = registration?.suggestions?.map((s) => s.id).join(",") ?? "";
  const sceneIds = registration?.context.scenes?.map((s) => s.id).join(",") ?? "";

  const signature = useMemo(
    () => registrationSignature(registration),
    [
      registration?.scopeType,
      registration?.scopeId,
      registration?.context.seriesId,
      registration?.context.episodeId,
      registration?.context.sceneId,
      registration?.context.briefMarkdown,
      registration?.context.seriesMemoryMarkdown,
      registration?.context.workspace?.view,
      registration?.context.workspace?.viewLabel,
      registration?.context.workspace?.episodeTitle,
      registration?.context.workspace?.sceneTitle,
      registration?.context.workspace?.scenePrompt,
      registration?.context.workspace?.sceneActLabel,
      registration?.context.workspace?.activeTakeSummary,
      registration?.context.workspace?.selectedCharacterName,
      registration?.context.workspace?.selectedIngredientName,
      ingredientIds,
      suggestionIds,
      sceneIds,
      Boolean(registration?.onOutputEvent),
    ],
  );

  useEffect(() => {
    register(registrationRef.current);
    return () => register(null);
  }, [register, signature]);
}

export function CopilotWorkspaceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const route = useMemo(() => parseStudioRoute(pathname), [pathname]);
  const active = route.isSeriesRoute;

  const [prefs, setPrefs] = useState<CopilotPanelPrefs>(DEFAULT_COPILOT_PANEL_PREFS);
  const [registered, setRegistered] = useState<CopilotRegistration | null>(null);
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<string>>(() => new Set());
  const [messagesVersion, setMessagesVersion] = useState(0);
  const [copilotDraft, setCopilotDraft] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(loadCopilotPanelPrefs());
  }, []);

  const registerRef = useRef<CopilotRegistration | null>(null);
  const lastSignatureRef = useRef<string | null>(null);
  const outputHandlerRef = useRef<((event: CopilotOutputEvent) => void) | null>(null);
  const contextRef = useRef<CopilotContextPayload | null>(null);

  const register = useCallback((registration: CopilotRegistration | null) => {
    const signature = registrationSignature(registration);

    registerRef.current = registration;
    contextRef.current = registration?.context ?? null;
    outputHandlerRef.current = registration?.onOutputEvent ?? null;

    if (signature === lastSignatureRef.current) {
      return;
    }

    lastSignatureRef.current = signature;
    setRegistered(registration);
  }, []);

  const reg = registered;

  const scopeType: CopilotScopeType | null =
    reg?.scopeType ?? (route.episodeId ? "episode" : route.seriesId ? "series" : null);
  const scopeId: string | null = reg?.scopeId ?? route.episodeId ?? route.seriesId;

  const context = reg?.context ?? null;
  const ingredients = reg?.ingredients ?? [];
  const suggestions = (reg?.suggestions ?? []).filter((s) => !dismissedSuggestionIds.has(s.id));

  const updatePrefs = useCallback((patch: Partial<CopilotPanelPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveCopilotPanelPrefs(next);
      return next;
    });
  }, []);

  const setCollapsed = useCallback(
    (collapsed: boolean) => updatePrefs({ collapsed }),
    [updatePrefs],
  );
  const toggleCollapsed = useCallback(
    () => updatePrefs({ collapsed: !prefs.collapsed }),
    [prefs.collapsed, updatePrefs],
  );
  const setDock = useCallback((dock: CopilotPanelPrefs["dock"]) => updatePrefs({ dock }), [updatePrefs]);
  const setMode = useCallback((mode: CopilotPanelPrefs["mode"]) => updatePrefs({ mode }), [updatePrefs]);
  const setWidth = useCallback((width: number) => updatePrefs({ width }), [updatePrefs]);
  const setFloatPosition = useCallback(
    (floatX: number, floatY: number) => updatePrefs({ floatX, floatY }),
    [updatePrefs],
  );

  const dismissSuggestion = useCallback((id: string) => {
    setDismissedSuggestionIds((prev) => new Set(prev).add(id));
  }, []);

  const getLiveContext = useCallback(() => contextRef.current, []);
  const bumpMessages = useCallback(() => setMessagesVersion((v) => v + 1), []);

  const value = useMemo<CopilotWorkspaceContextValue>(
    () => ({
      active,
      scopeType,
      scopeId,
      context,
      ingredients,
      suggestions,
      prefs,
      messagesVersion,
      setCollapsed,
      toggleCollapsed,
      setDock,
      setMode,
      setWidth,
      setFloatPosition,
      dismissSuggestion,
      copilotDraft,
      setCopilotDraft,
      getLiveContext,
      outputHandlerRef,
      register,
      bumpMessages,
    }),
    [
      active,
      scopeType,
      scopeId,
      context,
      ingredients,
      suggestions,
      prefs,
      messagesVersion,
      setCollapsed,
      toggleCollapsed,
      setDock,
      setMode,
      setWidth,
      setFloatPosition,
      dismissSuggestion,
      copilotDraft,
      setCopilotDraft,
      getLiveContext,
      register,
      bumpMessages,
    ],
  );

  return (
    <CopilotWorkspaceContext.Provider value={value}>{children}</CopilotWorkspaceContext.Provider>
  );
}
