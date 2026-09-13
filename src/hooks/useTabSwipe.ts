import { useCallback, useEffect, useRef, useState } from "react";
import { findGestureOwner } from "../lib/gestureScope";

interface Options {
  tabs: readonly string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  threshold?: number;
  enabled?: boolean;
}

export type TabSwipeDirection = "next" | "prev" | null;

export function useTabSwipe({ tabs, activeTab, onTabChange, threshold = 70, enabled = true }: Options) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const containerRef = useCallback((el: HTMLElement | null) => setContainer(el), []);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const [dragDirection, setDragDirection] = useState<TabSwipeDirection>(null);
  const [dragDistance, setDragDistance] = useState(0);

  useEffect(() => {
    if (!container) return;

    function onTouchStart(e: TouchEvent) {
      if (!enabled) return;
      if (findGestureOwner(e.target, "x", container!)) return;
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (startX.current === null) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - (startY.current ?? 0);
      if (Math.abs(dy) > Math.abs(dx)) {
        startX.current = null;
        setDragDirection(null);
        setDragDistance(0);
        return;
      }

      const idx = tabs.indexOf(activeTabRef.current);
      if (dx < 0 && idx < tabs.length - 1) {
        setDragDirection("next");
        setDragDistance(Math.min(-dx, threshold));
      } else if (dx > 0 && idx > 0) {
        setDragDirection("prev");
        setDragDistance(Math.min(dx, threshold));
      } else {
        setDragDirection(null);
        setDragDistance(0);
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (startX.current === null) return;
      const dx = e.changedTouches[0].clientX - startX.current;
      startX.current = null;
      startY.current = null;
      setDragDirection(null);
      setDragDistance(0);

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
  }, [container, tabs, onTabChange, threshold, enabled]);

  return { containerRef, dragDirection, dragDistance };
}
