import { useEffect, useRef, useState } from "react";

/** True while `active`, and for at least `minMs` from when it became active. */
export function useMinimumVisible(active: boolean, minMs: number) {
  const [held, setHeld] = useState(false);
  const startedAt = useRef(0);

  if (active && !held) setHeld(true);

  useEffect(() => {
    if (active) {
      startedAt.current = Date.now();
      return;
    }
    const remaining = Math.max(0, minMs - (Date.now() - startedAt.current));
    const id = setTimeout(() => setHeld(false), remaining);
    return () => clearTimeout(id);
  }, [active, minMs]);

  return active || held;
}
