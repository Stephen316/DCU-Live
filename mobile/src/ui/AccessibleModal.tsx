import { Modal, ModalProps } from 'react-native';

export interface AccessibleModalProps extends Omit<ModalProps, 'onShow' | 'onRequestClose'> {
  label: string;
  onShow?: () => void;
  onRequestClose: () => void;
}

export function AccessibleModal({ label: _label, ...props }: AccessibleModalProps) {
  return <Modal {...props} />;
}
