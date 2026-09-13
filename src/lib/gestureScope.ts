export type GestureAxis = "x" | "y";

function isNativelyScrollable(el: HTMLElement, axis: GestureAxis): boolean {
  const overflow =
    axis === "x" ? getComputedStyle(el).overflowX : getComputedStyle(el).overflowY;
  const scrollable = overflow === "auto" || overflow === "scroll";
  const hasOverflowContent =
    axis === "x" ? el.scrollWidth > el.clientWidth : el.scrollHeight > el.clientHeight;
  return scrollable && hasOverflowContent;
}

export function findGestureOwner(
  target: EventTarget | null,
  axis: GestureAxis,
  boundary: HTMLElement,
): HTMLElement | null {
  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== boundary) {
    const owner = el.dataset.gestureOwner;
    if (owner === axis || owner === "all") return el;
    if (isNativelyScrollable(el, axis)) return el;
    el = el.parentElement;
  }
  return null;
}
