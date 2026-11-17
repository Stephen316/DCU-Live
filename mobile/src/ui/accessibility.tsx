import { KeyboardEvent, useEffect } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text } from 'react-native';

/** Put keyboard behavior on the same controls that respond to touch and accessibility actions. */
export function choiceKeys(selected: boolean) {
  if (Platform.OS !== 'web') return {};
  return {
    tabIndex: selected ? 0 as const : -1 as const,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const control = event.currentTarget;
      const group = control.closest('[role="tablist"], [role="radiogroup"]');
      if (!group || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === ' ') {
        event.preventDefault();
        if (!event.repeat) control.click();
        return;
      }
      const vertical = group.getAttribute('aria-orientation') === 'vertical';
      const radio = group.getAttribute('role') === 'radiogroup';
      const previous = event.key === (vertical ? 'ArrowUp' : 'ArrowLeft') || (radio && event.key === 'ArrowUp');
      const next = event.key === (vertical ? 'ArrowDown' : 'ArrowRight') || (radio && event.key === 'ArrowDown');
      if (!previous && !next && event.key !== 'Home' && event.key !== 'End') return;
      const role = radio ? 'radio' : 'tab';
      const choices = Array.from(group.querySelectorAll<HTMLElement>(`[role="${role}"]:not([aria-disabled="true"])`));
      const index = choices.indexOf(control);
      if (index < 0) return;
      const last = choices.length - 1;
      const destination = event.key === 'Home' ? 0 : event.key === 'End' ? last
        : next ? (index + 1) % choices.length : (index + last) % choices.length;
      event.preventDefault();
      choices[destination].focus();
      choices[destination].click();
    },
  };
}

export function spaceKey(onPress: () => void) {
  if (Platform.OS !== 'web') return {};
  return {
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== ' ') return;
      event.preventDefault();
      if (!event.repeat) onPress();
    },
  };
}

/** A mounted live region on the web, and an accessibility announcement on the phone. */
export function StatusMessage({ message, urgent = false }: { message: string; urgent?: boolean }) {
  useEffect(() => {
    if (message && Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
  return Platform.OS === 'web'
    ? <Text role={urgent ? 'alert' : 'status'} aria-live={urgent ? 'assertive' : 'polite'} aria-atomic style={styles.visuallyHidden}>{message}</Text>
    : null;
}

const styles = StyleSheet.create({
  visuallyHidden: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', padding: 0, margin: -1 },
});
