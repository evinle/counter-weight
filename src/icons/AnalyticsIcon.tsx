import { Icon } from "./Icon";
import type { IconProps } from "./Icon";

export function AnalyticsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <line x1="6" y1="20" x2="6" y2="12" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="18" y1="20" x2="18" y2="9" />
    </Icon>
  );
}
