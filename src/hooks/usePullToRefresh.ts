import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  onRefresh: (() => Promise<void>) | null;
  threshold?: number;
}

export function usePullToRefresh({ onRefresh, threshold = 70 }: Options) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const containerRef = useCallback((el: HTMLElement | null) => setContainer(el), []);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const refreshing = useRef(false);

  useEffect(() => {
    if (!container || !onRefresh) return;

    function onTouchStart(e: TouchEvent) {
      if (container!.scrollTop > 0) return;
      startY.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta < 0) {
        startY.current = null;
        setPullDistance(0);
        return;
      }
      const clamped = Math.min(delta, threshold);
      pullDistanceRef.current = clamped;
      setPullDistance(clamped);
    }

    function onTouchEnd() {
      const dist = pullDistanceRef.current;
      startY.current = null;
      pullDistanceRef.current = 0;
      setPullDistance(0);
      if (dist >= threshold && !refreshing.current) {
        refreshing.current = true;
        onRefresh().finally(() => { refreshing.current = false; });
      }
    }

    container.addEventListener('touchstart', onTouchStart);
    container.addEventListener('touchmove', onTouchMove);
    container.addEventListener('touchend', onTouchEnd);
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, [container, onRefresh, threshold]);

  return { containerRef, pullDistance };
}
