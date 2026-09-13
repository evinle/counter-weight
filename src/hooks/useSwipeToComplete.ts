import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  onComplete: () => void;
  threshold?: number;
}

export function useSwipeToComplete({ onComplete, threshold = 96 }: Options) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const containerRef = useCallback((el: HTMLElement | null) => setContainer(el), []);
  const [dragX, setDragX] = useState(0);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const dragXRef = useRef(0);

  useEffect(() => {
    if (!container) return;
    const complete = onComplete;

    function onTouchStart(e: TouchEvent) {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (startX.current === null) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - (startY.current ?? 0);
      if (Math.abs(dy) > Math.abs(dx)) {
        startX.current = null;
        dragXRef.current = 0;
        setDragX(0);
        return;
      }
      const clamped = Math.max(0, dx);
      dragXRef.current = clamped;
      setDragX(clamped);
    }

    function onTouchEnd() {
      const dist = dragXRef.current;
      startX.current = null;
      dragXRef.current = 0;
      setDragX(0);
      if (dist >= threshold) complete();
    }

    container.addEventListener("touchstart", onTouchStart);
    container.addEventListener("touchmove", onTouchMove);
    container.addEventListener("touchend", onTouchEnd);
    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
    };
  }, [container, onComplete, threshold]);

  return { containerRef, dragX };
}
