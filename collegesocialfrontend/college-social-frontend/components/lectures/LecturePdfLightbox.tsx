'use client';

import { Modal } from '@/components/ui/Modal';

export function LecturePdfLightbox({
  open,
  onClose,
  url,
  title,
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} className="h-[85vh] max-w-4xl">
      <iframe src={url} title={title} className="h-full max-h-[calc(85vh-4rem)] w-full rounded-xl border border-border" />
    </Modal>
  );
}
