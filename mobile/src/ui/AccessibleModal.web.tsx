import { useEffectEvent, useLayoutEffect, useRef } from 'react';
import type { AccessibleModalProps } from './AccessibleModal';

export function AccessibleModal({ visible, ...props }: AccessibleModalProps) {
  return visible && typeof document !== 'undefined' ? <OpenDialog {...props} /> : null;
}

/** The browser keeps the page (and any parent dialog) inert and restores focus on close. */
function OpenDialog({ children, label, onRequestClose, onShow }: AccessibleModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const shown = useEffectEvent(() => onShow?.());

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    const first = dialog.querySelector<HTMLElement>('[data-dialog-heading]')
      ?? dialog.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]');
    first?.focus();
    shown();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onRequestClose();
      }}
      style={{
        position: 'fixed', inset: 0, margin: 0, padding: 0, border: 0,
        width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none',
        background: 'transparent', color: 'inherit', overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>{children}</div>
    </dialog>
  );
}
