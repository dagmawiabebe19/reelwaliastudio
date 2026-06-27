"use client";

import { createContext, useContext } from "react";

type StudioNavContextValue = {
  openNav: () => void;
};

const StudioNavContext = createContext<StudioNavContextValue | null>(null);

export const StudioNavProvider = StudioNavContext.Provider;

export function useStudioNav(): StudioNavContextValue {
  const ctx = useContext(StudioNavContext);
  return ctx ?? { openNav: () => {} };
}
