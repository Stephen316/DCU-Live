// Wheels from React Native Wheel Picker by Sergey Rozhkov, MIT: https://github.com/quidone/react-native-wheel-picker
import WheelPicker, { type PickerItem } from '@quidone/react-native-wheel-picker';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { AccessibilityActionEvent, Platform, StyleSheet, View } from 'react-native';
import { Txt } from './components';
import { Radius, Space, Type, useTheme } from './theme';

/** One row of a wheel: a comfortable thumb's height, and what the selection band frames. */
const ROW = 40;
/** Rows either side of the chosen one, fading as they turn away, unless a wheel asks for fewer. */
const AROUND = 2;
const COLUMN = 72;

const HOURS = items(24);
const MINUTES = items(60);

/**
 * Hours and minutes on two wheels, as Clock sets an alarm: each spins and settles a row at a
 * time, the chosen time on a band across the middle. On the phone the wheels are React
 * Native Wheel Picker's, plain JS so an update reaches the app without a store build; the
 * browser has its own in `TimeWheel.web.tsx`. 24-hour, as times are written everywhere else
 * in the app, and every minute, since 23:59 is the commonest hand-in time.
 */
export function TimeWheel({ hours, minutes, onChange, around = AROUND }: {
  hours: number;
  minutes: number;
  onChange: (hours: number, minutes: number) => void;
  /** Rows shown either side of the chosen one: 1 for a card with no room to spare. */
  around?: number;
}) {
  const theme = useTheme();
  // Both wheels can come to rest in the same moment, before either change has come back as
  // props; each builds on the other's latest, so neither undoes the other.
  const latest = useRef({ hours, minutes });
  useEffect(() => {
    latest.current = { hours, minutes };
  }, [hours, minutes]);
  const change = (next: Partial<{ hours: number; minutes: number }>) => {
    latest.current = { ...latest.current, ...next };
    onChange(latest.current.hours, latest.current.minutes);
  };
  return (
    <View style={[styles.wheels, { height: ROW * (around * 2 + 1) }]}>
      <View pointerEvents="none" style={[styles.band, { top: ROW * around, backgroundColor: theme.raised }]} />
      <Wheel items={HOURS} value={hours} label="Hour" around={around} onChange={(h) => change({ hours: h })} />
      <Txt type="title3" color={theme.inkSecondary} style={styles.figure} importantForAccessibility="no" accessibilityElementsHidden>:</Txt>
      <Wheel items={MINUTES} value={minutes} label="Minutes" around={around} onChange={(m) => change({ minutes: m })} />
    </View>
  );
}

function Wheel({ items: data, value, label, around, onChange }: {
  items: PickerItem<number>[];
  around: number;
  value: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const theme = useTheme();
  const count = data.length;
  // Each step round the loop, as the hardware wheel's up and down do.
  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') onChange((value + 1) % count);
    if (e.nativeEvent.actionName === 'decrement') onChange((value + count - 1) % count);
  };
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: pad(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
      style={[styles.column, { height: ROW * (around * 2 + 1) }]}
    >
      <WheelPicker
        data={data}
        value={value}
        onValueChanged={({ item }) => onChange(item.value)}
        // A light tick for each row that crosses the band, as the real wheel clicks.
        onValueChanging={() => { if (Platform.OS === 'ios') void Haptics.selectionAsync(); }}
        itemHeight={ROW}
        visibleItemCount={around * 2 + 1}
        width={COLUMN}
        enableScrollByTapOnItem
        // The band is drawn once behind both wheels and the colon, not once per wheel.
        renderOverlay={null}
        itemTextStyle={[Type.title3, styles.figure, { color: theme.ink }]}
      />
    </View>
  );
}

function items(count: number): PickerItem<number>[] {
  return Array.from({ length: count }, (_, n) => ({ value: n, label: pad(n) }));
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

const styles = StyleSheet.create({
  wheels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Space.xs },
  // Behind the middle row of both wheels and the colon between them.
  band: { position: 'absolute', left: 0, right: 0, height: ROW, borderRadius: Radius.control },
  column: { width: COLUMN },
  figure: { fontVariant: ['tabular-nums'] },
});
