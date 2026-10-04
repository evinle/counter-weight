export const ALL_PUSH_KINDS = ["lead", "deadline", "overdue"] as const;

export const PushKind = {
  Lead: "lead",
  Deadline: "deadline",
  Overdue: "overdue",
} as const satisfies Record<string, (typeof ALL_PUSH_KINDS)[number]>;
export type PushKind = (typeof PushKind)[keyof typeof PushKind];

export function isPushKind(v: unknown): v is PushKind {
  return ALL_PUSH_KINDS.some((kind) => kind === v);
}

export type PushPayload = {
  serverId: string;
  title: string;
  emoji: string;
  kind: PushKind;
  overdueBy?: string;
};

function field(data: object, key: string): unknown {
  return key in data ? Reflect.get(data, key) : undefined;
}

export function parsePushPayload(data: unknown): PushPayload | null {
  if (!data || typeof data !== "object") return null;
  const serverId = field(data, "serverId");
  const title = field(data, "title");
  const emoji = field(data, "emoji");
  // Pushes sent before `kind` existed are deadline notifications.
  const kind = field(data, "kind") ?? PushKind.Deadline;
  const overdueBy = field(data, "overdueBy");
  if (
    typeof serverId !== "string" ||
    typeof title !== "string" ||
    typeof emoji !== "string" ||
    !isPushKind(kind)
  )
    return null;
  if (typeof overdueBy === "string") {
    return { serverId, title, emoji, kind, overdueBy };
  }
  return { serverId, title, emoji, kind };
}

export function pushNotificationTitle(payload: PushPayload): string {
  return payload.emoji ? `${payload.emoji} ${payload.title}` : payload.title;
}

export function pushNotificationBody(payload: PushPayload): string {
  switch (payload.kind) {
    case PushKind.Lead:
      return "Time's almost up";
    case PushKind.Deadline:
      return "Time's up";
    case PushKind.Overdue:
      return payload.overdueBy ? `Overdue by ${payload.overdueBy}` : "Overdue";
    default: {
      const unhandled: never = payload.kind;
      throw new Error(`Unhandled push kind: ${unhandled}`);
    }
  }
}
