import type { ReactNode } from "react";

export interface IconProps {
  /** Size and colour come from classes (`icon-md`, `text-accent`, …). Defaults to `icon-sm`. */
  className?: string;
}

interface Props extends IconProps {
  children: ReactNode;
  /** Solid shapes filled with currentColor instead of stroked outlines. */
  filled?: boolean;
}

const SIZE_CLASS = /(^|\s)icon-(sm|md|lg|xl)(\s|$)/;

/** Shared SVG shell. Stroke defaults and sizes live in the `icon*` utilities in index.css. */
export function Icon({ className = "", filled = false, children }: Props) {
  const size = SIZE_CLASS.test(className) ? "" : "icon-sm";
  return (
    <svg
      viewBox="0 0 24 24"
      className={[filled ? "icon-filled" : "icon", size, className]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
