import { CancellationStatus } from '../src/core/cancellation';
import { DeadlineRules, highlightReason } from '../src/core/deadline';
import { changeFromRow, makeChange, SharedClasses, TimetableAudience, TimetableChange, TimetableChanges } from '../src/core/profile';
import { DublinTime } from '../src/core/time';
import { TeachingWeek, TimetableCategory, TimetableEvent, WeekCalendar } from '../src/core/timetableEvent';
import { SharedClassInput, TimetableChangeStore } from '../src/data/courseData';
import { TimetableSource } from '../src/data/dcuApi';
import { createServices } from '../src/data/services';
import { MemoryKV } from '../src/data/storage';
import { WeekModel } from '../src/features/week/WeekModel';
import { at, event } from './helpers';

const shared = makeChange({
  id: '11111111-2222-4333-8444-555555555555', courseKey: 'EEG1', kind: 'add', module: 'MS134', title: 'Statistics',
  activityCode: 'MS134[1]OC/L1', dates: ['2026-09-24'], start: '09:00', end: '10:00', shared: true,
});

describe('a class shared for the course', () => {
  test('a row says whether a student shared it; the console\'s say nothing and are not', () => {
    const row = { id: 'x', course_key: 'EEG1', kind: 'add', module: 'MS134', dates: ['2026-09-24'], start_time: '09:00', end_time: '10:00', title: 'Stats' };
    expect(changeFromRow({ ...row, shared: true })?.shared).toBe(true);
    expect(changeFromRow(row)?.shared).toBe(false);
  });

  test('it is drawn with its own id and its kind of class, and the id leads back to its row', () => {
    const [drawn] = TimetableChanges.apply([], [shared], new TimetableAudience('EEG1'), DublinTime.date('2026-09-21', '00:00'));
    expect(drawn.id).toBe('shared-11111111-2222-4333-8444-555555555555-2026-09-24');
    expect(drawn.activity.kind).toBe('L');
    expect(SharedClasses.isShared(drawn)).toBe(true);
    expect(SharedClasses.changeIdOf(drawn)).toBe(shared.id);
    // The console's own additions keep their ids.
    const [console] = TimetableChanges.apply([], [{ ...shared, shared: false }], new TimetableAudience('EEG1'), DublinTime.date('2026-09-21', '00:00'));
    expect(console.id.startsWith('change-')).toBe(true);
    expect(SharedClasses.changeIdOf(console)).toBeNull();
  });

  test('every week means the same weekday in each teaching week from its own, skipping a week that is not one', () => {
    // 5 October is reading week: no teaching week starts then.
    const weekStarts = [at(2026, 9, 14), at(2026, 9, 21), at(2026, 9, 28), at(2026, 10, 12)];
    expect(SharedClasses.weeklyDates('2026-09-23', weekStarts)).toEqual(['2026-09-23', '2026-09-30', '2026-10-14']);
    expect(SharedClasses.weeklyDates('2026-12-25', weekStarts)).toEqual(['2026-12-25']);
    const year = Array.from({ length: 80 }, (_, i) => at(2026, 9, 14 + i * 7));
    expect(SharedClasses.weeklyDates('2026-09-14', year)).toHaveLength(60);
  });

  test('voted down, it reads as not on rather than cancelled', () => {
    const [drawn] = TimetableChanges.apply([], [shared], new TimetableAudience('EEG1'), DublinTime.date('2026-09-21', '00:00'));
    const flagged = DeadlineRules.highlight(drawn, [], new CancellationStatus(3));
    expect(flagged).toEqual({ kind: 'cancelled', reportCount: 3, decidedBy: null, shared: true });
    expect(highlightReason(flagged!)).toBe('Not on · 3 people say so');
    expect(highlightReason(DeadlineRules.highlight(drawn, [], new CancellationStatus(1))!)).toBe('Reported not on · 1 person');
    // A DCU class keeps its words.
    const lecture = event('EEG1001[1]OC/L1/01', at(2026, 9, 23, 9));
    expect(highlightReason(DeadlineRules.highlight(lecture, [], new CancellationStatus(3))!)).toBe('Cancelled · reported by 3 people');
  });
});

// MARK: - Through the week model

const weeks: TeachingWeek[] = [
  { number: 1, label: '1', firstDay: at(2026, 9, 14) },
  { number: 2, label: '2', firstDay: at(2026, 9, 21) },
  { number: 3, label: '3', firstDay: at(2026, 9, 28) },
];

class FakeSource implements TimetableSource {
  async searchProgrammes() { return []; }
  async weekCalendar() { return new WeekCalendar(weeks, []); }
  async events(_c: TimetableCategory, _w: TeachingWeek[]): Promise<TimetableEvent[]> { return []; }
}

/** The server's side: what `share_class` saves is what the course downloads next. */
class FakeChangeStore implements TimetableChangeStore {
  saved: TimetableChange[] = [];
  shares: SharedClassInput[] = [];
  async changes(courseKey: string) { return this.saved.filter((c) => c.courseKey === courseKey); }
  async share(input: SharedClassInput) {
    this.shares.push(input);
    const id = `aaaaaaaa-0000-4000-8000-00000000000${this.shares.length}`;
    this.saved.push(makeChange({
      id, courseKey: input.courseKey, kind: 'add', module: input.module, title: input.title,
      activityCode: `${input.module}[1]OC/${input.kind}1`, dates: input.dates, start: input.start, end: input.end, shared: true,
    }));
    return id;
  }
  async withdrawShared(id: string) { this.saved = this.saved.filter((c) => c.id !== id); }
}

async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

afterEach(() => jest.useRealTimers());

test('a class shared every week shows in each week, is theirs to take down, and goes for everyone', async () => {
  jest.useFakeTimers({ now: at(2026, 9, 21, 8), doNotFake: ['setTimeout', 'setImmediate', 'nextTick', 'queueMicrotask'] });
  const services = await createServices({ kv: new MemoryKV(), secrets: { get: async () => null, set: async () => {}, remove: async () => {} }, env: {} });
  const store = new FakeChangeStore();
  services.timetableChanges = store;
  const programme: TimetableCategory = { identity: 'p', name: 'ECE1 (Electronic Eng)', categoryTypeIdentity: 't' };
  const m = new WeekModel(services, programme, new FakeSource(), new TimetableAudience('EEG1'));
  await m.start();
  await settle();
  expect(m.shareCourse).toBe('EEG1');

  await m.shareClass({ code: 'MS134', title: 'Statistics', kind: 'T', date: '2026-09-24', start: '09:00', end: '10:00', room: null }, 'weekly');
  expect(store.shares[0].dates).toEqual(['2026-09-24', '2026-10-01']);
  const thisWeek = m.events.find((e) => SharedClasses.isShared(e));
  expect(thisWeek?.activity.kind).toBe('T');
  expect(m.sharedByMe(thisWeek!)).toBe(true);

  m.setWeekIndex(2);
  await settle();
  expect(m.events.some((e) => SharedClasses.isShared(e))).toBe(true);

  await m.withdrawShared(thisWeek!);
  expect(store.saved).toEqual([]);
  expect(m.events.some((e) => SharedClasses.isShared(e))).toBe(false);
});

test('with no course to share with, Add class keeps it for the student alone', async () => {
  const services = await createServices({ kv: new MemoryKV(), secrets: { get: async () => null, set: async () => {}, remove: async () => {} }, env: {} });
  services.timetableChanges = new FakeChangeStore();
  const programme: TimetableCategory = { identity: 'p', name: 'X', categoryTypeIdentity: 't' };
  expect(new WeekModel(services, programme, new FakeSource(), null).shareCourse).toBeNull();
});
