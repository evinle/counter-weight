import { Icon } from "./Icon";
import type { IconProps } from "./Icon";

export function HistoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 0 2.64-6.36" />
      <path d="M3 3v6h6" />
      <polyline points="12 7 12 12 15 14" />
    </Icon>
  );
}
