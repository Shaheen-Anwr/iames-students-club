import { LectureFoldersGrid } from '@/components/lectures/LectureFoldersGrid';

export default function VideoLecturesPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <LectureFoldersGrid
        attachmentType="video"
        basePath="/lectures/video"
        title="محاضرات فيديو"
        emptyLabel="لا توجد مجلدات بعد. أنشئ مجلدًا لمادة دراسية لتبدأ."
      />
    </div>
  );
}
