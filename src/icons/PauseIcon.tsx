import { Icon } from "./Icon";
import type { IconProps } from "./Icon";

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props} filled>
      <rect x="5" y="3" width="5" height="18" rx="1.5" />
      <rect x="14" y="3" width="5" height="18" rx="1.5" />
    </Icon>
  );
}
