'use client';

import { useParams } from 'next/navigation';
import { LecturesBrowser } from '@/components/lectures/LecturesBrowser';

export default function PdfLectureFolderPage() {
  const { folder } = useParams<{ folder: string }>();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <LecturesBrowser
        attachmentType="lecture"
        uploadAccept=".pdf"
        title="محاضرات PDF"
        uploadLabel="رفع محاضرة"
        emptyLabel="لا توجد محاضرات في هذا المجلد بعد. كن أول من يرفع محاضرة."
        folder={decodeURIComponent(folder)}
        foldersHref="/lectures/pdf"
      />
    </div>
  );
}
