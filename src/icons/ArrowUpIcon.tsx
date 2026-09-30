import { Icon } from "./Icon";
import type { IconProps } from "./Icon";

export function ArrowUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </Icon>
  );
}
