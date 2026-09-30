/**
 * Colour slots for tags and groups. A tag or group stores a slot name
 * (`"red"`); the actual colour lives in `index.css` as `--color-swatch-<slot>`,
 * so the palette can be retuned without touching stored data.
 */
export const EntityColor = {
  Red: "red",
  Orange: "orange",
  Yellow: "yellow",
  Green: "green",
  Blue: "blue",
  Violet: "violet",
  Pink: "pink",
  Grey: "grey",
} as const satisfies Record<string, string>;
export type EntityColor = (typeof EntityColor)[keyof typeof EntityColor];

/** Every slot, in picker order. */
export const ENTITY_COLORS: readonly EntityColor[] = Object.values(EntityColor);

/** Groups can't be grey: no colour at all is how a group stays neutral. */
export const GROUP_COLORS: readonly EntityColor[] = ENTITY_COLORS.filter(
  (c) => c !== EntityColor.Grey,
);

export function isEntityColor(v: unknown): v is EntityColor {
  return ENTITY_COLORS.some((c) => c === v);
}

/** The hex presets the old pickers stored, each mapped to the slot that replaced it. */
const LEGACY_HEX_TO_COLOR = new Map<string, EntityColor>([
  ["#ef4444", EntityColor.Red],
  ["#f97316", EntityColor.Orange],
  ["#eab308", EntityColor.Yellow],
  ["#22c55e", EntityColor.Green],
  ["#3b82f6", EntityColor.Blue],
  ["#8b5cf6", EntityColor.Violet],
  ["#ec4899", EntityColor.Pink],
  ["#6b7280", EntityColor.Grey],
]);

export function legacyHexToColor(hex: string): EntityColor | undefined {
  return LEGACY_HEX_TO_COLOR.get(hex.toLowerCase());
}

/** The slot for a stored colour: a slot name, or an old preset hex. Anything else has none. */
export function normalizeEntityColor(stored: string | null): EntityColor | null {
  if (stored === null) return null;
  if (isEntityColor(stored)) return stored;
  return legacyHexToColor(stored) ?? null;
}

/** CSS value for a slot, for inline `background-color`. */
export function entityColorVar(color: EntityColor): string {
  return `var(--color-swatch-${color})`;
}

/** CSS `background-color` for a stored colour. Unknown or missing colours fall back to grey. */
export function entityColorCss(stored: string | null): string {
  return entityColorVar(normalizeEntityColor(stored) ?? EntityColor.Grey);
}

/** Display name for a slot, e.g. "Red". Used as the accessible name of its swatch. */
export function entityColorLabel(color: EntityColor): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}
