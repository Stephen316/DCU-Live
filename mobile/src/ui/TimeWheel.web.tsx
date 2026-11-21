// Wheels from React Wheel Picker by Chánh Đại, MIT: https://github.com/ncdai/react-wheel-picker
import { WheelPicker, WheelPickerWrapper, type WheelPickerOption } from '@ncdai/react-wheel-picker';
import '@ncdai/react-wheel-picker/style.css';
import { useEffect, useRef, type CSSProperties } from 'react';
import { useTheme } from './theme';
import './TimeWheel.web.css';

/** One row of a wheel: what the selection band frames. */
const ROW = 40;
/** Rows either side of the chosen one, unless a wheel asks for fewer. */
const AROUND = 2;

/**
 * Slots on the wheel's ring for a wheel `around` rows either side of the middle. The picker
 * is as tall as its ring is wide, about 2·row / tan(360° / slots), so this solves that for
 * the rows wanted: 16 slots for five rows, 10 for three.
 */
function ring(around: number): number {
  const radius = (ROW * (around * 2 + 1) - ROW / 4) / 2;
  return Math.round(360 / (Math.atan(ROW / radius) * 180 / Math.PI));
}

const HOURS = options(24);
const MINUTES = options(60);

/**
 * Hours and minutes on two looping wheels, as Clock sets an alarm, the chosen time on a band
 * across the middle. In the browser the wheels are React Wheel Picker's, which turns by
 * touch, mouse drag, the scroll wheel and the arrow keys; the phone draws its own in
 * `TimeWheel.tsx`. 24-hour, as times are written everywhere else in the app, and every
 * minute, since 23:59 is the commonest hand-in time.
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
  const colours = {
    '--time-wheel-ink': theme.ink,
    '--time-wheel-faint': theme.inkSecondary,
    '--time-wheel-band': theme.raised,
  } as CSSProperties;
  return (
    <div className="time-wheel" style={colours}>
      <WheelPickerWrapper className="time-wheel-wheels">
        <Wheel label="Hour" options={HOURS} value={hours} slots={ring(around)} onChange={(h) => change({ hours: h })} />
        <span className="time-wheel-colon" aria-hidden>:</span>
        <Wheel label="Minutes" options={MINUTES} value={minutes} slots={ring(around)} onChange={(m) => change({ minutes: m })} />
      </WheelPickerWrapper>
    </div>
  );
}

function Wheel({ label, options, value, slots, onChange }: {
  label: string;
  options: WheelPickerOption<number>[];
  value: number;
  slots: number;
  onChange: (value: number) => void;
}) {
  return (
    // The picker names nothing itself, so its column says what it sets and to what.
    <div className="time-wheel-column" role="group" aria-label={`${label}, ${pad(value)}`}>
      <WheelPicker
        options={options}
        value={value}
        onValueChange={onChange}
        infinite
        visibleCount={slots}
        optionItemHeight={ROW}
        classNames={{ optionItem: 'time-wheel-row', highlightWrapper: 'time-wheel-band', highlightItem: 'time-wheel-chosen' }}
      />
    </div>
  );
}

function options(count: number): WheelPickerOption<number>[] {
  return Array.from({ length: count }, (_, n) => ({ value: n, label: pad(n), textValue: pad(n) }));
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
