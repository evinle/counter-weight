import { Icon } from "./Icon";
import type { IconProps } from "./Icon";

export function TimerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <line x1="10" y1="2" x2="14" y2="2" />
      <line x1="12" y1="14" x2="15" y2="11" />
      <circle cx="12" cy="14" r="8" />
    </Icon>
  );
}
