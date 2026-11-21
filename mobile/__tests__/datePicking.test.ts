import { DatePicking } from '../src/core/datePicking';
import { at } from './helpers';

describe('The due-date calendar', () => {
  test('lays a month out Monday first, padding the first and last weeks', () => {
    // October 2026 starts on a Thursday and has 31 days.
    const weeks = DatePicking.monthGrid(2026, 9);
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0][3]?.getDate()).toBe(1);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks[weeks.length - 1].filter(Boolean).pop()?.getDate()).toBe(31);
  });

  test('a month that starts on a Monday has no padding before it', () => {
    // June 2026 starts on a Monday.
    expect(DatePicking.monthGrid(2026, 5)[0][0]?.getDate()).toBe(1);
  });

  test('steps across a year end', () => {
    expect(DatePicking.stepMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(DatePicking.stepMonth(2027, 0, -1)).toEqual({ year: 2026, month: 11 });
  });

  test('picking a day keeps the time, and picking a time keeps the day', () => {
    const due = at(2026, 10, 14, 17, 30);
    expect(DatePicking.withDay(due, at(2026, 10, 20))).toEqual(at(2026, 10, 20, 17, 30));
    expect(DatePicking.withTime(due, 9, 5)).toEqual(at(2026, 10, 14, 9, 5));
  });
});
