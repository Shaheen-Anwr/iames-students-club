import { LecturesBrowser } from '@/components/lectures/LecturesBrowser';

export default function VideoLecturesPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <LecturesBrowser
        attachmentType="video"
        uploadAccept="video/*"
        title="محاضرات فيديو"
        uploadLabel="رفع فيديو"
        emptyLabel="لا توجد فيديوهات بعد. كن أول من يرفع فيديو."
      />
    </div>
  );
}
