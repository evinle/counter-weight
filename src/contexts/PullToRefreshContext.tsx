import { createContext, useContext, useState, type ReactNode } from "react";

interface PullToRefreshState {
  pullDistance: number;
  setPullDistance: (n: number) => void;
}

const PullToRefreshContext = createContext<PullToRefreshState | null>(null);

export function PullToRefreshProvider({ children }: { children: ReactNode }) {
  const [pullDistance, setPullDistance] = useState(0);
  return (
    <PullToRefreshContext.Provider value={{ pullDistance, setPullDistance }}>
      {children}
    </PullToRefreshContext.Provider>
  );
}

export function usePullDistance() {
  const ctx = useContext(PullToRefreshContext);
  if (!ctx) throw new Error("usePullDistance must be used within PullToRefreshProvider");
  return ctx;
}
