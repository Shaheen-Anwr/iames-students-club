'use client';

import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  destructive = true,
  loading,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
