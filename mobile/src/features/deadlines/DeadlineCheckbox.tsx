import { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

export interface DeadlineCheckboxProps {
  label: string;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function DeadlineCheckbox({ label, checked, busy, onToggle, children }: DeadlineCheckboxProps) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, busy }}
      style={styles.control}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  control: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
