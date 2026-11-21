import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { activitySummary, kindLabel } from '../../core/activityCode';
import { CUSTOM_KINDS, CustomClass, CustomKind, timeAfter } from '../../core/customClasses';
import { EditRepeat, TimetableEdit } from '../../core/timetableEdits';
import { addDays, DublinTime, formatTime, formatWeekdayDayMonth, isSameDay, startOfDay, weekdayName } from '../../core/time';
import { shortTitleOf, TimetableEvent } from '../../core/timetableEvent';
import { ActionSheet, AppSwitch, BottomCard, Icon, IconButton, PrimaryButton, Segmented, SheetAction, Txt } from '../../ui/components';
import { DropdownMenu } from '../../ui/DropdownMenu';
import { TimeWheel } from '../../ui/TimeWheel';
import { Radius, Space, useTheme } from '../../ui/theme';

/** What a tap does in Edit timetable: adds a ghost, or removes one of the student's classes. */
export type EditKind = TimetableEdit['kind'];

/** A class tapped in Edit timetable, waiting for "every week or just this once". */
export interface PendingEdit {
  event: TimetableEvent;
  kind: EditKind;
}

/**
 * Where a change in Edit timetable has got to. A tap on a class asks what to do with it; a
 * swap asks what to swap to and then for how long; a class set in Add class asks only for
 * how long.
 */
export type EditStep =
  | { step: 'choose'; edit: PendingEdit; cancelled: boolean; replacements: TimetableEvent[]; sharedByMe: boolean }
  | { step: 'replaceWith'; event: TimetableEvent; replacements: TimetableEvent[] }
  | { step: 'replaceRepeat'; event: TimetableEvent; replacement: TimetableEvent }
  | { step: 'ownRepeat'; draft: OwnClassDraft; shared: boolean };

/** What the sheets hand back once the student has decided. */
export interface EditActions {
  edit: (edit: PendingEdit, repeat: EditRepeat) => void;
  replace: (cancelled: TimetableEvent, replacement: TimetableEvent, repeat: EditRepeat) => void;
  /** `shared`: for everyone on the course (supabase/phase61), not just this student. */
  addOwnClass: (draft: OwnClassDraft, repeat: EditRepeat, shared: boolean) => void;
  /** Takes down a class this student shared, for everyone. */
  withdrawShared: (event: TimetableEvent) => void;
}

/** A class set at a time of the student's own, before they say how often. */
export type OwnClassDraft = Omit<CustomClass, 'id' | 'repeat'>;

/** The longest list of swaps offered: past that, a week has more choice than a menu can show. */
const MAX_REPLACEMENTS = 8;

/** "Wednesday 13:00–14:00 · Lecture · Group 02", to tell one session of a module from another. */
function sessionLabel(event: TimetableEvent): string {
  return `${weekdayName(event.start)} ${formatTime(event.start)}–${formatTime(event.end)} · ${activitySummary(event.activity)}`;
}

const when = (event: TimetableEvent) => `${weekdayName(event.start)}, ${formatTime(event.start)}–${formatTime(event.end)}`;

/**
 * Every question Edit timetable asks, one card at a time: add or remove a class, swap one of
 * the student's (a cancelled one, most often) for another session of its module, or say how
 * long a class set in Add class is for. Each answer leads to the next card or to the change itself.
 */
export function EditSheets({ step, onStep, actions }: {
  step: EditStep | null;
  onStep: (step: EditStep | null) => void;
  actions: EditActions;
}) {
  // The card keeps its question while it slides away, rather than going blank.
  const [shown, setShown] = useState(step);
  if (step && step !== shown) setShown(step);

  let title: string | undefined;
  let message: string | undefined;
  let list: SheetAction[] = [];
  if (shown?.step === 'choose') {
    const { edit, cancelled, replacements, sharedByMe } = shown;
    const verb = edit.kind === 'add' ? 'Add' : 'Remove';
    const remove = edit.kind === 'remove';
    // With a swap on offer it's no longer only a question of removing it.
    title = remove && replacements.length > 0 ? `Change ${shortTitleOf(edit.event)}?` : `${verb} ${shortTitleOf(edit.event)}?`;
    message = cancelled ? `${when(edit.event)} · reported cancelled` : when(edit.event);
    const replace: SheetAction[] = remove && replacements.length > 0
      ? [{ label: 'Replace with another session…', icon: 'swap', onPress: () => onStep({ step: 'replaceWith', event: edit.event, replacements }) }]
      : [];
    // One they shared themselves comes off everyone's timetable, or off just theirs for a day.
    const choices: SheetAction[] = remove && sharedByMe
      ? [
          { label: 'Remove for everyone', destructive: true, onPress: () => actions.withdrawShared(edit.event) },
          { label: `Hide only on ${formatWeekdayDayMonth(edit.event.start)}`, onPress: () => actions.edit(edit, 'once') },
        ]
      : [
          { label: `${verb} every week`, destructive: remove, onPress: () => actions.edit(edit, 'weekly') },
          { label: `${verb} only on ${formatWeekdayDayMonth(edit.event.start)}`, destructive: remove, onPress: () => actions.edit(edit, 'once') },
        ];
    // A cancelled class is most likely being swapped; any other, dropped.
    list = cancelled ? [...replace, ...choices] : [...choices, ...replace];
  } else if (shown?.step === 'replaceWith') {
    const { event, replacements } = shown;
    title = `Replace ${shortTitleOf(event)} with…`;
    message = `Instead of ${when(event)}`;
    list = replacements.slice(0, MAX_REPLACEMENTS).map((replacement) => ({
      label: sessionLabel(replacement),
      onPress: () => onStep({ step: 'replaceRepeat', event, replacement }),
    }));
  } else if (shown?.step === 'replaceRepeat') {
    const { event, replacement } = shown;
    title = `Go to ${shortTitleOf(replacement)} instead?`;
    message = `${sessionLabel(replacement)}, in place of ${when(event)}`;
    // Just this once comes first: a cancellation is for a day, and the weeks after stay as they were.
    list = [
      { label: 'Only this week', onPress: () => actions.replace(event, replacement, 'once') },
      { label: 'Every week', onPress: () => actions.replace(event, replacement, 'weekly') },
    ];
  } else if (shown?.step === 'ownRepeat') {
    const { draft, shared } = shown;
    const day = DublinTime.date(draft.date, draft.start);
    title = shared ? `Add ${draft.title ?? draft.code} for everyone?` : `Add ${draft.title ?? draft.code}?`;
    const when = `${day ? weekdayName(day) : ''} ${draft.start}–${draft.end} · ${kindLabel(draft.kind)}`.trim();
    message = shared ? `${when}. Everyone on your course will see it.` : when;
    list = [
      { label: day ? `Add only on ${formatWeekdayDayMonth(day)}` : 'Add only this week', onPress: () => actions.addOwnClass(draft, 'once', shared) },
      { label: 'Add every week', onPress: () => actions.addOwnClass(draft, 'weekly', shared) },
    ];
  }

  return <ActionSheet visible={step !== null} title={title} message={message} actions={list} onClose={() => onStep(null)} />;
}

/** One of the student's modules, as Add class offers it. */
export interface ModuleChoice {
  code: string;
  /** Its short name, or the code again when no class names it. */
  name: string;
}

/**
 * Add class: a class at a time of the student's own, for one DCU's timetable doesn't show
 * then — a lecture moved by email, a make-up lab. One of their modules, what kind of class,
 * the day, time and length, then "once or every week" on the next card. All of it fits on
 * the card at once, with nothing to scroll to. For everyone on the course by default, where
 * there's a course to share it with; the next card says which day it lands on.
 */
export function AddClassCard({ visible, weekStart, modules, shareCourse, onSetOwn, onClose }: {
  visible: boolean;
  /** The course a class can be shared with, or null when there's none: then it's theirs alone. */
  shareCourse: string | null;
  /** Monday of the week on screen, for the days offered. */
  weekStart: Date | null;
  /** The student's own modules: the only ones offered. */
  modules: ModuleChoice[];
  onSetOwn: (draft: OwnClassDraft, shared: boolean) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [code, setCode] = useState<string | null>(null);
  const [own, setOwn] = useState<OwnForm>(() => blankOwnForm(weekStart));
  const [pickingModule, setPickingModule] = useState(false);
  // On by default: a class DCU's timetable has wrong is most often wrong for the whole course.
  const [shared, setShared] = useState(true);
  const moduleButton = useRef<View>(null);
  // iOS ignores a modal presented while another is still animating away, so the next card
  // waits for this one to finish going, with a fallback in case that never comes.
  const pending = useRef<(() => void) | null>(null);
  const runPending = () => {
    const next = pending.current;
    pending.current = null;
    next?.();
  };

  const chosen = modules.find((m) => m.code === code) ?? null;

  const close = () => {
    setCode(null);
    setPickingModule(false);
    setShared(true);
    setOwn(blankOwnForm(weekStart));
    onClose();
  };

  /** Closes the card, then runs `next` once it has gone (on iOS, which needs it gone first). */
  const closeThen = (next: () => void) => {
    if (Platform.OS === 'ios') {
      pending.current = next;
      close();
      setTimeout(runPending, 700);
    } else {
      close();
      next();
    }
  };

  const days = weekStart ? Array.from({ length: 5 }, (_, i) => addDays(startOfDay(weekStart), i)) : [];
  const start = `${String(own.hours).padStart(2, '0')}:${String(own.minutes).padStart(2, '0')}`;
  const end = timeAfter(start, own.length);
  const ownDay = days[own.day] ?? null;
  const ready = code !== null && end !== null && ownDay !== null;
  const next = () => {
    if (!ready || !code || !ownDay || !end) return;
    const draft: OwnClassDraft = {
      // Left blank, it goes by its module's name, as the module's own classes do.
      code, title: own.title.trim() || (chosen && chosen.name !== chosen.code ? chosen.name : null), kind: own.kind, date: DublinTime.dateString(ownDay), start, end,
      room: own.room.trim() || null,
    };
    const forEveryone = shared && shareCourse !== null;
    closeThen(() => onSetOwn(draft, forEveryone));
  };

  return (
    <BottomCard visible={visible} onClose={close} onDismissed={runPending}>
      <View style={styles.header}>
        <View style={styles.close}>
          <IconButton icon="close" label="Close" color={theme.inkSecondary} onPress={close} />
        </View>
        <Txt type="headline" accessibilityRole="header" style={styles.centre}>Add a class</Txt>
      </View>

      {/* Module and the class's own details, as one grouped block. */}
      <View style={[styles.group, { backgroundColor: theme.raised }]}>
        <View style={styles.moduleRow}>
          <Txt color={theme.inkSecondary}>Module</Txt>
          {modules.length > 0 ? (
            <View ref={moduleButton} collapsable={false} style={styles.moduleButton}>
              <Pressable
                onPress={() => setPickingModule(true)}
                accessibilityRole="button"
                accessibilityLabel={chosen ? `Module, ${chosen.name}` : 'Choose a module'}
                hitSlop={8}
                style={({ pressed }) => [styles.moduleChoice, pressed && { opacity: 0.6 }]}
              >
                <Txt numberOfLines={1} color={chosen ? theme.ink : theme.accent} style={styles.moduleName}>
                  {chosen ? (chosen.name === chosen.code ? chosen.code : `${chosen.name} · ${chosen.code}`) : 'Choose'}
                </Txt>
                <Icon name="dropdown" size={16} color={theme.accent} />
              </Pressable>
            </View>
          ) : (
            <Txt type="footnote" color={theme.inkSecondary} style={styles.moduleName}>Once your timetable loads</Txt>
          )}
        </View>
        <View style={[styles.hairline, { backgroundColor: theme.separator }]} />
        <View style={styles.inputs}>
          <TextInput
            value={own.title}
            onChangeText={(title) => setOwn({ ...own, title })}
            placeholder="Name (optional)"
            placeholderTextColor={theme.inkSecondary}
            accessibilityLabel="Name, optional"
            style={[styles.input, { color: theme.ink }]}
          />
          <View style={[styles.divider, { backgroundColor: theme.separator }]} />
          <TextInput
            value={own.room}
            onChangeText={(room) => setOwn({ ...own, room })}
            placeholder="Room (optional)"
            placeholderTextColor={theme.inkSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel="Room, optional"
            style={[styles.input, { color: theme.ink }]}
          />
        </View>
        {shareCourse !== null ? (
          <>
            <View style={[styles.hairline, { backgroundColor: theme.separator }]} />
            <View style={styles.moduleRow}>
              <Txt style={styles.shareLabel}>For everyone on your course</Txt>
              <AppSwitch value={shared} onValueChange={setShared} accessibilityLabel="For everyone on your course" />
            </View>
          </>
        ) : null}
      </View>
      <DropdownMenu
        visible={pickingModule}
        anchor={moduleButton}
        onClose={() => setPickingModule(false)}
        actions={modules.map((m) => ({ label: m.name === m.code ? m.code : `${m.name} · ${m.code}`, selected: m.code === code, onPress: () => setCode(m.code) }))}
      />

      <Segmented
        label="Kind of class"
        options={CUSTOM_KINDS.map((k) => ({ value: k, label: kindLabel(k) }))}
        value={own.kind}
        onChange={(kind) => setOwn({ ...own, kind })}
      />
      {days.length > 0 ? (
        <Segmented
          label="Day"
          options={days.map((d, i) => ({ value: String(i), label: weekdayName(d).slice(0, 3) }))}
          value={String(own.day)}
          onChange={(i) => setOwn({ ...own, day: Number(i) })}
        />
      ) : null}

      {/* The start on the wheel and the length beside it: one row, so the card needs no scrolling. */}
      <View style={styles.time}>
        <View style={styles.timeColumn}>
          <Txt type="footnote" color={theme.inkSecondary} style={styles.timeLabel}>Starts at</Txt>
          <TimeWheel around={1} hours={own.hours} minutes={own.minutes} onChange={(hours, minutes) => setOwn({ ...own, hours, minutes })} />
        </View>
        <View style={styles.lengthColumn}>
          <Txt type="footnote" color={theme.inkSecondary} style={styles.timeLabel}>Length</Txt>
          <View style={[styles.lengths, { backgroundColor: theme.raised }]} accessibilityRole="radiogroup" accessibilityLabel="Length">
            {LENGTHS.map((m) => {
              const selected = m === own.length;
              return (
                <Pressable
                  key={m}
                  onPress={() => setOwn({ ...own, length: m })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [styles.length, selected && { backgroundColor: theme.accent }, pressed && { opacity: 0.6 }]}
                >
                  <Txt type="subheadline" color={selected ? theme.onAccent : theme.inkSecondary} style={selected ? styles.semibold : undefined}>
                    {m === 60 ? '1 hour' : `${m / 60} hours`}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        {end === null ? (
          <Txt type="footnote" color={theme.destructive} style={styles.centre}>That runs past midnight: start it earlier or make it shorter.</Txt>
        ) : null}
        <PrimaryButton title={code ? 'Next' : 'Choose a module'} onPress={next} disabled={!ready} />
      </View>
    </BottomCard>
  );
}

/** What Set my own time is holding while it's filled in. */
interface OwnForm {
  title: string;
  kind: CustomKind;
  /** Mon–Fri index into the week on screen. */
  day: number;
  hours: number;
  minutes: number;
  /** Minutes long. */
  length: number;
  room: string;
}

/** The lengths offered: most classes are one of these. */
const LENGTHS = [60, 120, 180];

/** A lecture at nine, on today if today is in the week on screen, else on its Monday. */
function blankOwnForm(weekStart: Date | null): OwnForm {
  const today = new Date();
  const index = weekStart ? Array.from({ length: 5 }, (_, i) => addDays(startOfDay(weekStart), i)).findIndex((d) => isSameDay(d, today)) : -1;
  return { title: '', kind: 'L', day: Math.max(index, 0), hours: 9, minutes: 0, length: 60, room: '' };
}

const styles = StyleSheet.create({
  header: { gap: Space.xxs, alignItems: 'center', paddingHorizontal: Space.xxl },
  // Over the card's top-left corner, clear of the centred title.
  close: { position: 'absolute', top: -Space.s, left: -Space.s, zIndex: 1 },
  centre: { textAlign: 'center' },
  semibold: { fontWeight: '600' },
  group: { borderRadius: Radius.control, overflow: 'hidden' },
  hairline: { height: StyleSheet.hairlineWidth, marginLeft: Space.m },
  moduleRow: { flexDirection: 'row', alignItems: 'center', gap: Space.m, minHeight: 44, paddingHorizontal: Space.m },
  moduleButton: { flex: 1, alignItems: 'flex-end' },
  moduleChoice: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, maxWidth: '100%', minHeight: 44 },
  moduleName: { flexShrink: 1, textAlign: 'right' },
  shareLabel: { flex: 1 },
  inputs: { flexDirection: 'row', alignItems: 'stretch' },
  divider: { width: StyleSheet.hairlineWidth, marginVertical: Space.s },
  input: { flex: 1, minWidth: 0, fontSize: 17, minHeight: 44, paddingHorizontal: Space.m },
  time: { flexDirection: 'row', gap: Space.l, alignItems: 'flex-start' },
  timeColumn: { gap: Space.xs },
  lengthColumn: { flex: 1, gap: Space.xs },
  timeLabel: { fontWeight: '600', marginHorizontal: Space.s },
  // As a segmented control, stood on end: the chosen length on the violet pill.
  lengths: { borderRadius: Radius.control + 3, padding: 3 },
  // The same height as a segmented control's segments, so the three fit beside the wheel.
  length: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.control },
  footer: { gap: Space.s },
});
