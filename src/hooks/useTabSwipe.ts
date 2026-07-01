import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  tabs: readonly string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  threshold?: number;
}

export function useTabSwipe({ tabs, activeTab, onTabChange, threshold = 70 }: Options) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const containerRef = useCallback((el: HTMLElement | null) => setContainer(el), []);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    if (!container) return;

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
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (startX.current === null) return;
      const dx = e.changedTouches[0].clientX - startX.current;
      startX.current = null;
      startY.current = null;

      const current = activeTabRef.current;
      const idx = tabs.indexOf(current);
      if (idx === -1) return;

      if (dx < -threshold && idx < tabs.length - 1) {
        onTabChange(tabs[idx + 1]);
      } else if (dx > threshold && idx > 0) {
        onTabChange(tabs[idx - 1]);
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
  }, [container, tabs, onTabChange, threshold]);

  return { containerRef };
}
