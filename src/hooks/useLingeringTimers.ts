import { useCallback, useEffect, useRef, useState } from "react";
import { DEPARTURE_LINGER_MS } from "../lib/gestures";
import type { Timer } from "../db/schema";

interface Ghost {
  timer: Timer;
  index: number;
}

/**
 * Keeps a timer's card on screen for `lingerMs` after it leaves `timers`, but only for timers
 * passed to `hold`. Anything else that leaves the list disappears immediately.
 */
export function useLingeringTimers(timers: Timer[], lingerMs = DEPARTURE_LINGER_MS) {
  const [ghosts, setGhosts] = useState<Map<number, Ghost>>(new Map());
  const timersRef = useRef(timers);
  const timeouts = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    timersRef.current = timers;
  });

  useEffect(() => {
    const pending = timeouts.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const hold = useCallback(
    (timer: Timer) => {
      if (timer.id === undefined) return;
      const id = timer.id;
      const index = timersRef.current.findIndex((t) => t.id === id);
      setGhosts((prev) => new Map(prev).set(id, { timer, index }));
      clearTimeout(timeouts.current.get(id));
      timeouts.current.set(
        id,
        setTimeout(() => {
          timeouts.current.delete(id);
          setGhosts((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
        }, lingerMs),
      );
    },
    [lingerMs],
  );

  const liveIds = new Set(timers.map((t) => t.id));
  const visible = [...timers];
  [...ghosts.values()]
    .filter((g) => !liveIds.has(g.timer.id))
    .sort((a, b) => a.index - b.index)
    .forEach((g) => visible.splice(Math.min(g.index, visible.length), 0, g.timer));

  return { timers: visible, hold };
}
