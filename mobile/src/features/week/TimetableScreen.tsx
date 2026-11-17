import { router, useFocusEffect } from 'expo-router';
import { useIsFocused } from 'expo-router/react-navigation';
import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { addDays, daysBetween, formatDayMonth, formatWeekdayDayMonth, isSameDay, isToday, isTomorrow, startOfDay, startOfWeek, weekdayName, WeekHeading } from '../../core/time';
import { WeekdayIndex } from '../../core/misc';
import { TimetableEvent } from '../../core/timetableEvent';
import { listenForMacAlertTaps } from '../../data/macShell';
import { useWeekFirst } from '../../ui/floatingBar';
import { listenForAlertTaps } from '../../data/notifications';
import { useAppEvent, useModel, useNow } from '../../state/hooks';
import { useRoot, useWeekModel } from '../../state/root';
import { EmptyState, IconButton, Label, PillButton, PrimaryButton, ScreenHeader, Txt } from '../../ui/components';
import { StatusMessage } from '../../ui/accessibility';
import { LoadingScreen } from '../../ui/LoadingScreen';
import { Space, useTheme } from '../../ui/theme';
import { useTutorial } from '../tutorial/Tutorial';
import { DayPage } from './DayPage';
import { EditChoiceSheet, EditKind, PendingEdit } from './editing';
import { ContributionCard } from './ContributionCard';
import { SubgroupCard } from './SubgroupCard';
import { Pager, PagerControl } from './Pager';
import { WeekGridView } from './WeekGrid';

/**
 * The timetable: the day or the week, each its own tab, both drawn on the same grid. Both are
 * this screen; `owner` marks the one the app opens on, which alone listens for what happens to
 * the timetable (alerts tapped, changes arriving) so nothing is handled twice.
 */
export function TimetableScreen({ mode, owner = false }: { mode: 'day' | 'week'; owner?: boolean }) {
  const theme = useTheme();
  const focused = useIsFocused();
  const { subgroupQuestion } = useRoot();
  const model = useModel(useWeekModel());
  const now = useNow();
  // Said relative to today, so it moves on by itself when Monday comes.
  const shownWeek = model.weeks[model.weekIndex];
  const heading = shownWeek ? WeekHeading.of(shownWeek.firstDay, shownWeek.label, now) : null;
  const showsCalendar = mode === 'week';
  const desktopWeek = useWeekFirst() && showsCalendar;
  const pager = useRef<PagerControl>(null);
  const screen = useRef<View>(null);
  const classTrigger = useRef<string | null>(null);
  const focusDay = useRef(false);
  const pageIndex = showsCalendar ? model.weekIndex : WeekdayIndex.flat(model.weekIndex, model.dayIndex);
  const pageCount = showsCalendar ? model.weeks.length : model.weeks.length * WeekdayIndex.daysPerWeek;

  useFocusEffect(useCallback(() => {
    const id = classTrigger.current;
    if (id === null) return;
    const deadline = Date.now() + 500;
    let frame: number;
    const restore = () => {
      const element = screen.current as unknown as HTMLElement | null;
      if (element?.contains(document.activeElement)) {
        classTrigger.current = null;
        return;
      }
      const trigger = element?.querySelector<HTMLElement>(`[data-class-id="${CSS.escape(id)}"]:not([inert] *)`);
      // The tab can restore before the pager has measured and drawn its class buttons.
      if (!trigger && Date.now() < deadline) {
        frame = requestAnimationFrame(restore);
        return;
      }
      classTrigger.current = null;
      (trigger ?? element?.querySelector<HTMLElement>('[data-screen-heading]'))?.focus({ preventScroll: true });
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, []));

  // A date tab belongs to the pager's old page. Transfer its focus to the selected tab
  // in the new page, even if both pages are kept mounted for the animation.
  useLayoutEffect(() => {
    if (!focusDay.current) return;
    focusDay.current = false;
    (screen.current as unknown as HTMLElement | null)
      ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]:not([inert] *)')?.focus({ preventScroll: true });
  }, [pageIndex]);
  /** Edit timetable: the course's other classes show as ghosts, and a tap adds or removes. */
  const [editing, setEditing] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const tutorial = useTutorial();

  useEffect(() => {
    void model.start();
  }, [model]);

  // The tutorial waits for a week to point at.
  const hasWeek = !model.isLoading && model.weeks.length > 0;
  useEffect(() => {
    if (hasWeek) tutorial?.markReady();
  }, [hasWeek, tutorial]);

  // Coming back to the app is a fresh look at the timetable, so start again from today (or
  // tomorrow evening) — but only after a real trip to the background, not Control Centre.
  const lastAppState = useRef(AppState.currentState);
  useEffect(() => {
    if (!owner) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (lastAppState.current === 'background' && next === 'active') model.resetToDefaultDay();
      // Alerts that have fired make room for later ones under iOS's limit.
      if (next === 'active') model.scheduleAlerts();
      lastAppState.current = next;
    });
    return () => sub.remove();
  }, [model, owner]);

  // A tapped class alert opens that class, as a Calendar alert opens its event.
  useEffect(() => (owner ? listenForAlertTaps((id) => router.push({ pathname: '/class/[id]', params: { id } })) : undefined), [owner]);
  useEffect(() => (owner ? listenForMacAlertTaps((id) => router.push({ pathname: '/class/[id]', params: { id } })) : undefined), [owner]);

  useAppEvent('timetableChangesChanged', () => owner && model.reloadChanges());
  useAppEvent('moduleSplitsChanged', () => owner && model.reloadSplits());
  useAppEvent('moduleTitlesChanged', () => owner && model.reloadTitles());
  useAppEvent('moduleAbbreviationsChanged', () => owner && model.reloadAbbreviations());
  useAppEvent('labRotationChanged', () => owner && void model.reloadAll());

  const open = (event: TimetableEvent) => {
    if (Platform.OS === 'web') classTrigger.current = event.id;
    router.push({ pathname: '/class/[id]', params: { id: event.id } });
  };
  const askToEdit = (event: TimetableEvent, kind: EditKind) => setPendingEdit({ event, kind });

  let body: ReactNode;
  if (model.errorText && model.events.length === 0) {
    body = (
      <EmptyState
        icon="offline"
        title="Couldn't load this week"
        message={model.errorText}
        action={<PrimaryButton title="Try again" onPress={() => void model.start()} />}
      />
    );
  } else if (showsCalendar) {
    // Same pager as the day view — weeks instead of days, stopping at the ends of the year.
    body = (
      <Pager
        count={Math.max(model.weeks.length, 1)}
        index={model.weekIndex}
        onIndexChange={(i) => model.setWeekIndex(i)}
        controlRef={pager}
        locked={tutorial ? !tutorial.swipeAllowed : false}
        onDragChange={tutorial?.setDragging}
        renderPage={(i) => (
          <WeekGridView
            eventsByDay={model.eventsByDayForWeekIndex(i)}
            ghostsByDay={editing ? model.ghostsByDayForWeekIndex(i) : []}
            editing={editing}
            isLoaded={model.isLoadedWeekIndex(i)}
            weekStart={model.weeks[i]?.firstDay ?? null}
            clashingIDs={model.clashingIDs}
            highlight={(e) => model.highlight(e)}
            dueAt={(e) => model.dueAt(e)}
            onSelect={open}
            onEdit={askToEdit}
            now={now}
          />
        )}
      />
    );
  } else {
    body = (
      // Every weekday of the year in one run, so Friday swipes on to the next week's Monday.
      <Pager
        count={Math.max(model.weeks.length * WeekdayIndex.daysPerWeek, 1)}
        index={WeekdayIndex.flat(model.weekIndex, model.dayIndex)}
        controlRef={pager}
        swipe="easy"
        locked={tutorial ? !tutorial.swipeAllowed : false}
        onDragChange={tutorial?.setDragging}
        onIndexChange={(i) => {
          const { week, day } = WeekdayIndex.split(i);
          model.setDay(week, day);
          if (i > pageIndex) tutorial?.signal('daySwiped');
        }}
        renderPage={(i) => {
          const { week, day: offset } = WeekdayIndex.split(i);
          const firstDay = model.weeks[week]?.firstDay;
          const day = firstDay ? addDays(startOfDay(firstDay), offset) : null;
          return (
            <DayPage
              day={day}
              events={day ? model.eventsByDayForWeekIndex(week).find((d) => isSameDay(d.day, day))?.events ?? [] : []}
              ghosts={day && editing ? model.ghostsByDayForWeekIndex(week).find((d) => isSameDay(d.day, day))?.events ?? [] : []}
              editing={editing}
              now={now}
              clashingIDs={model.clashingIDs}
              highlight={(e) => model.highlight(e)}
              dueAt={(e) => model.dueAt(e)}
              isLoading={model.isLoading}
              onSelect={open}
              onEdit={askToEdit}
              onPick={(picked) => {
                const offset = firstDay ? daysBetween(startOfDay(firstDay), startOfDay(picked)) : 0;
                const destination = WeekdayIndex.flat(week, offset);
                if (offset < 0 || offset >= WeekdayIndex.daysPerWeek || destination === pageIndex) return;
                if (Platform.OS === 'web') {
                  const element = screen.current as unknown as HTMLElement | null;
                  focusDay.current = !!element?.contains(document.activeElement) &&
                    document.activeElement?.getAttribute('role') === 'tab';
                }
                model.setDay(week, offset);
                if (destination > pageIndex) tutorial?.signal('daySwiped');
              }}
            />
          );
        }}
      />
    );
  }

  // The Day tab is titled by its day; the Week tab by its week ("This week", "Next week").
  const shownDay = shownWeek ? addDays(startOfDay(shownWeek.firstDay), model.dayIndex) : null;
  const dayLine = shownDay ? (isToday(shownDay, now) ? 'Today' : isTomorrow(shownDay, now) ? 'Tomorrow' : formatDayMonth(shownDay)) : '';
  // With the arrows, the week's number sits between them, so the middle doesn't say it again:
  // "This week" alone, or the month for a week further off (whose heading would be its number).
  const numbered = desktopWeek && !!shownWeek && heading?.title === `Week ${shownWeek.label}`;
  const weekTitle = desktopWeek ? (numbered ? heading?.detail : heading?.title) ?? '' : heading?.title ?? '';
  const weekDetail = desktopWeek ? '' : heading?.detail ?? '';
  const title = editing ? 'Edit timetable' : showsCalendar ? weekTitle : shownDay ? weekdayName(shownDay) : '';
  const detail = editing
    ? (showsCalendar ? weekTitle : shownDay ? `${weekdayName(shownDay)} ${formatDayMonth(shownDay)}` : '') ?? ''
    : showsCalendar ? weekDetail : [dayLine, heading?.detail].filter(Boolean).join(' · ');

  const period = showsCalendar ? 'week' : 'day';
  const weekStart = shownWeek ? startOfWeek(shownWeek.firstDay) : null;
  const weekEnd = weekStart ? addDays(weekStart, 4) : null;
  const dateStatus = showsCalendar && weekStart && weekEnd && heading
    ? `${heading.title}, ${formatDayMonth(weekStart)}${weekStart.getFullYear() !== weekEnd.getFullYear() ? ` ${weekStart.getFullYear()}` : ''} to ${formatDayMonth(weekEnd)} ${weekEnd.getFullYear()}`
    : shownDay ? formatWeekdayDayMonth(shownDay) : '';

  return (
    <View ref={screen} collapsable={false} style={[styles.fill, { backgroundColor: theme.canvas }]}>
      <StatusMessage message={focused ? dateStatus : ""} />
      <ScreenHeader
        title={title}
        subtitle={
          <View style={styles.subtitle}>
            {detail ? <Txt type="footnote" color={theme.inkSecondary} numberOfLines={1}>{detail}</Txt> : null}
            {model.campusName && !editing ? <Label icon="place" text={model.campusName} type="footnote" color={theme.inkSecondary} /> : null}
          </View>
        }
        left={shownWeek ? (
          <>
            <IconButton icon="back" label={`Previous ${period}`} disabled={pageIndex === 0} onPress={() => pager.current?.turn(-1)} />
            {/* Which week the arrows are on, so turning them reads as counting through the term. */}
            {desktopWeek ? (
              <Txt type="subheadline" style={styles.weekNumber} numberOfLines={1}>Week {shownWeek.label}</Txt>
            ) : null}
            <IconButton icon="forward" label={`Next ${period}`} disabled={pageIndex >= pageCount - 1} onPress={() => pager.current?.turn(1)} />
          </>
        ) : undefined}
        right={
          // Editing lives here and only here: on the day and the week, the two places a class can be added or dropped.
          <>
            {desktopWeek && !editing ? <PillButton title="Today" onPress={() => model.showCurrentWeek()} /> : null}
            {editing
              ? <PillButton title="Done" filled onPress={() => setEditing(false)} />
              : <PillButton title="Edit" icon="edit" label="Edit timetable" onPress={() => setEditing(true)} />}
          </>
        }
      />

      <View style={styles.fill}>
        {body}
        {model.waitingForFirstWeek ? (
          <LoadingScreen caption="Loading your timetable…" slowCaption="Still waiting on DCU's timetable server…" />
        ) : null}
      </View>

      {/* The subgroup question first: it changes the timetable itself, so it waits on nothing else. */}
      {owner ? <SubgroupCard ready={hasWeek && !editing} /> : null}
      {owner ? <ContributionCard ready={hasWeek && !editing && !subgroupQuestion} /> : null}
      <EditChoiceSheet
        pending={pendingEdit}
        onChoose={({ event, kind }, repeat) => model.edit(kind, repeat, event)}
        onClose={() => setPendingEdit(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  subtitle: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  weekNumber: { fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 64, textAlign: 'center' },
});
