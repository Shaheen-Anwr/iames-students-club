'use client';

import { useParams } from 'next/navigation';
import { LecturesBrowser } from '@/components/lectures/LecturesBrowser';

export default function VideoLectureFolderPage() {
  const { folder } = useParams<{ folder: string }>();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <LecturesBrowser
        attachmentType="video"
        uploadAccept="video/*"
        title="محاضرات فيديو"
        uploadLabel="رفع فيديو"
        emptyLabel="لا توجد فيديوهات في هذا المجلد بعد. كن أول من يرفع فيديو."
        folder={decodeURIComponent(folder)}
        foldersHref="/lectures/video"
      />
    </div>
  );
}
