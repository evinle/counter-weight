export interface DateFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface DatetimeConstraints {
  yearMax: number;
  monthMax: number;
  dayMax: number;
  hourMax: number;
  minuteMax: number;
  secondMax: number;
  constrain: (date: Date) => Date;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function useDatetimeConstraints(
  fields: DateFields,
  maxDate: Date | undefined,
): DatetimeConstraints {
  const currentYear = new Date().getFullYear();

  if (!maxDate) {
    return {
      yearMax: currentYear + 10,
      monthMax: 12,
      dayMax: daysInMonth(fields.year, fields.month),
      hourMax: 23,
      minuteMax: 59,
      secondMax: 59,
      constrain: (d) => d,
    };
  }

  const maxYear = maxDate.getFullYear();
  const maxMonth = maxDate.getMonth() + 1;
  const maxDay = maxDate.getDate();
  const maxHour = maxDate.getHours();
  const maxMinute = maxDate.getMinutes();
  const maxSecond = maxDate.getSeconds();

  const atMaxYear = fields.year === maxYear;
  const atMaxMonth = atMaxYear && fields.month === maxMonth;
  const atMaxDay = atMaxMonth && fields.day === maxDay;
  const atMaxHour = atMaxDay && fields.hour === maxHour;
  const atMaxMinute = atMaxHour && fields.minute === maxMinute;

  function constrain(date: Date): Date {
    const y = Math.min(date.getFullYear(), maxYear);
    const m =
      y === maxYear
        ? Math.min(date.getMonth() + 1, maxMonth)
        : date.getMonth() + 1;
    const naturalDayMax = daysInMonth(y, m);
    const dMax =
      y === maxYear && m === maxMonth
        ? Math.min(maxDay, naturalDayMax)
        : naturalDayMax;
    const d = Math.min(date.getDate(), dMax);
    const h =
      y === maxYear && m === maxMonth && d === maxDay
        ? Math.min(date.getHours(), maxHour)
        : date.getHours();
    const min =
      y === maxYear && m === maxMonth && d === maxDay && h === maxHour
        ? Math.min(date.getMinutes(), maxMinute)
        : date.getMinutes();
    const s =
      y === maxYear &&
      m === maxMonth &&
      d === maxDay &&
      h === maxHour &&
      min === maxMinute
        ? Math.min(date.getSeconds(), maxSecond)
        : date.getSeconds();
    return new Date(y, m - 1, d, h, min, s);
  }

  return {
    yearMax: maxYear,
    monthMax: atMaxYear ? maxMonth : 12,
    dayMax: atMaxMonth ? maxDay : daysInMonth(fields.year, fields.month),
    hourMax: atMaxDay ? maxHour : 23,
    minuteMax: atMaxHour ? maxMinute : 59,
    secondMax: atMaxMinute ? maxSecond : 59,
    constrain,
  };
}
