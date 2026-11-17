import { useId } from 'react';
import { useTheme } from './theme';

export function TimeWheel({ hours, minutes, onChange }: {
  hours: number;
  minutes: number;
  onChange: (hours: number, minutes: number) => void;
}) {
  const hourID = useId();
  const minuteID = useId();
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
      <TimeField id={hourID} label="Hour" value={hours} count={24} onChange={(hour) => onChange(hour, minutes)} />
      <TimeField id={minuteID} label="Minute" value={minutes} count={60} onChange={(minute) => onChange(hours, minute)} />
    </div>
  );
}

function TimeField({ id, label, value, count, onChange }: {
  id: string;
  label: string;
  value: number;
  count: number;
  onChange: (value: number) => void;
}) {
  const theme = useTheme();
  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 88 }}>
      <label htmlFor={id} style={{ color: theme.inkSecondary, fontSize: 14 }}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} style={{
        font: 'inherit', fontSize: 17, minHeight: 44, color: theme.ink, background: theme.surface,
        border: `1px solid ${theme.inkTertiary}`, borderRadius: 8, padding: '0 8px',
      }}>
        {Array.from({ length: count }, (_, option) => (
          <option key={option} value={option}>{String(option).padStart(2, '0')}</option>
        ))}
      </select>
    </div>
  );
}
