export function angleToHour(angleDeg: number): number {
  const normalized = ((angleDeg % 360) + 360) % 360
  return Math.round(normalized / 30) % 12 || 12
}

export function angleToMinute(angleDeg: number): number {
  const normalized = ((angleDeg % 360) + 360) % 360
  return Math.round(normalized / 6) % 60
}

export function pointToAngle(px: number, py: number, cx: number, cy: number): number {
  const radians = Math.atan2(px - cx, -(py - cy))
  return ((radians * 180) / Math.PI + 360) % 360
}

export function to12h(date: Date): { hour: number; minute: number; isPm: boolean } {
  const h = date.getHours()
  return { hour: h % 12 || 12, minute: date.getMinutes(), isPm: h >= 12 }
}

export function to24h(hour12: number, minute: number, isPm: boolean): { hour: number; minute: number } {
  return { hour: isPm ? (hour12 % 12) + 12 : hour12 % 12, minute }
}
