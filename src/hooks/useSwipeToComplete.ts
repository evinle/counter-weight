import { useCallback, useEffect, useRef, useState } from "react";
import { ARM_TIMEOUT_MS, DROP_REVEAL_WIDTH, SWIPE_COMPLETE_THRESHOLD } from "../lib/gestures";

interface Options {
  onComplete: () => void;
  threshold?: number;
}

export function useSwipeToComplete({
  onComplete,
  threshold = SWIPE_COMPLETE_THRESHOLD,
}: Options) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const containerRef = useCallback((el: HTMLElement | null) => setContainer(el), []);
  const [dragX, setDragX] = useState(0);
  const [armed, setArmed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const armedRef = useRef(armed);
  const thresholdRef = useRef(threshold);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    armedRef.current = armed;
    thresholdRef.current = threshold;
  });

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setCompleted(true);
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [armed]);

  useEffect(() => {
    if (!container) return;
    const el = container;
    let startX = 0;
    let startY = 0;
    let width = 0;
    let dragging = false;
    let closeOnly = false;

    function clampDrag(dx: number) {
      return Math.min(Math.max(dx, -DROP_REVEAL_WIDTH), width);
    }

    function onPointerDown(e: PointerEvent) {
      if (completedRef.current) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      closeOnly = armedRef.current;
      if (closeOnly) setArmed(false);
      startX = e.clientX;
      startY = e.clientY;
      width = el.getBoundingClientRect().width;
      dragging = true;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", stop);
    }

    function onPointerMove(e: PointerEvent) {
      if (!dragging) return;
      if (Math.abs(e.clientY - startY) > Math.abs(e.clientX - startX)) {
        stop();
        return;
      }
      setDragX(clampDrag(e.clientX - startX));
    }

    function onPointerUp(e: PointerEvent) {
      const dist = clampDrag(e.clientX - startX);
      stop();
      if (closeOnly) return;
      if (dist < 0) {
        if (-dist >= DROP_REVEAL_WIDTH / 2) setArmed(true);
      } else if (width > 0 && dist >= thresholdRef.current * width) {
        complete();
      }
    }

    function stop() {
      dragging = false;
      setDragX(0);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", stop);
    }

    el.addEventListener("pointerdown", onPointerDown);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", stop);
    };
  }, [container, complete]);

  return { containerRef, dragX, armed, completed, complete };
}
