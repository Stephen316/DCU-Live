import type { DeadlineCheckboxProps } from './DeadlineCheckbox';
import { useTheme } from '../../ui/theme';

export function DeadlineCheckbox({ label, checked, busy, onToggle, children }: DeadlineCheckboxProps) {
  const theme = useTheme();
  return (
    <div style={{ position: 'relative', display: 'grid', flex: 1, placeItems: 'center' }}>
      <input
        type="checkbox"
        aria-label={label}
        aria-busy={busy}
        checked={checked}
        onChange={onToggle}
        style={{
          appearance: 'none', position: 'absolute', inset: 0, margin: 0, cursor: 'pointer',
          width: '100%', height: '100%', borderRadius: 4, outlineColor: theme.accent, zIndex: 1,
        }}
      />
      <div aria-hidden="true">{children}</div>
    </div>
  );
}
