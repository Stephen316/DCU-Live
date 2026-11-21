/**
 * The arithmetic behind the due-date popups: a month laid out as a calendar page, and the
 * looping hour and minute wheels. No views, so it can be tested.
 */
export const DatePicking = {
  /**
   * A month as weeks of seven days, Monday first, as Irish calendars print it. Days outside
   * the month are null, so the first row starts on the right weekday.
   */
  monthGrid(year: number, month: number): (Date | null)[][] {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7; // Monday = 0
    const days = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(year, month, i + 1))];
    while (cells.length % 7 !== 0) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  },

  /** The month after (`1`) or before (`-1`) another, across a year end. */
  stepMonth(year: number, month: number, step: number): { year: number; month: number } {
    const d = new Date(year, month + step, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  },

  /** `value` moved to `day`, keeping its time. */
  withDay(value: Date, day: Date): Date {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), value.getHours(), value.getMinutes());
  },

  /** `value` at `hours`:`minutes` on the same day. */
  withTime(value: Date, hours: number, minutes: number): Date {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), hours, minutes);
  },
};
