import { useCallback, useEffect, useRef, useState } from "react";
import {
  ARM_TIMEOUT_MS,
  DROP_ARM_THRESHOLD,
  SWIPE_AXIS_SLOP_PX,
  SWIPE_COMPLETE_THRESHOLD,
} from "../lib/gestures";

interface Options {
  onComplete: () => void;
  threshold?: number;
  armThreshold?: number;
}

export function useSwipeToComplete({
  onComplete,
  threshold = SWIPE_COMPLETE_THRESHOLD,
  armThreshold = DROP_ARM_THRESHOLD,
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
  const armThresholdRef = useRef(armThreshold);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    armedRef.current = armed;
    thresholdRef.current = threshold;
    armThresholdRef.current = armThreshold;
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
    let horizontal = false;

    function clampDrag(dx: number) {
      return Math.min(Math.max(dx, -width), width);
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
      horizontal = false;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", stop);
    }

    function onPointerMove(e: PointerEvent) {
      if (!dragging) return;
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (!horizontal) {
        if (Math.max(dx, dy) < SWIPE_AXIS_SLOP_PX) return;
        if (dy > dx) {
          stop();
          return;
        }
        horizontal = true;
      }
      setDragX(clampDrag(e.clientX - startX));
    }

    function onPointerUp(e: PointerEvent) {
      const dist = clampDrag(e.clientX - startX);
      stop();
      if (closeOnly) return;
      if (dist < 0) {
        if (-dist >= armThresholdRef.current * width) setArmed(true);
      } else if (width > 0 && dist >= thresholdRef.current * width) {
        complete();
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (dragging && horizontal && e.cancelable) e.preventDefault();
    }

    function stop() {
      dragging = false;
      setDragX(0);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", stop);
    }

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", stop);
    };
  }, [container, complete]);

  return { containerRef, dragX, armed, completed, complete };
}
