import { Icon } from "./Icon";
import type { IconProps } from "./Icon";

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props} filled>
      <polygon points="6,3 21,12 6,21" />
    </Icon>
  );
}
