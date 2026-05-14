export function timeRemaining(target: Date): number {
  return target.getTime() - Date.now();
}

export function formatDuration(ms: number): string {
  if (ms < 0) return "-" + formatDuration(-ms);
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hms = [hours, minutes, seconds]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");

  return days > 0 ? `${days}d ${hms}` : hms;
}

export const ALL_HISTORY_TIMINGS = ["early", "on-time", "overdue"] as const;

export const HistoryTiming = {
  Early: "early",
  OnTime: "on-time",
  Overdue: "overdue",
} as const satisfies Record<string, (typeof ALL_HISTORY_TIMINGS)[number]>;
export type HistoryTiming = (typeof HistoryTiming)[keyof typeof HistoryTiming];

const EARLY_THRESHOLD = 0.1;

export function getHistoryAnnotation(
  targetDatetime: Date,
  updatedAt: Date,
  originalTargetDatetime: Date,
  createdAt: Date,
): { text: string; timing: HistoryTiming; extensionText?: string } {
  const diffMs = targetDatetime.getTime() - updatedAt.getTime();
  const totalDuration = originalTargetDatetime.getTime() - createdAt.getTime();
  const extensionMs =
    targetDatetime.getTime() - originalTargetDatetime.getTime();

  const earlyThresholdMs =
    totalDuration > 0 ? totalDuration * EARLY_THRESHOLD : 0;

  let timing: HistoryTiming;
  if (diffMs > earlyThresholdMs) {
    timing = HistoryTiming.Early;
  } else if (diffMs < 0) {
    timing = HistoryTiming.Overdue;
  } else {
    timing = HistoryTiming.OnTime;
  }

  const extensionText =
    extensionMs > 0 ? `- ${formatDuration(extensionMs)} extension` : undefined;

  return { text: formatDuration(Math.abs(diffMs)), timing, extensionText };
}
