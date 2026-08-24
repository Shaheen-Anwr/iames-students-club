import { LectureFoldersGrid } from '@/components/lectures/LectureFoldersGrid';

export default function PdfLecturesPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <LectureFoldersGrid
        attachmentType="lecture"
        basePath="/lectures/pdf"
        title="محاضرات PDF"
        emptyLabel="لا توجد مجلدات بعد. أنشئ مجلدًا لمادة دراسية لتبدأ."
      />
    </div>
  );
}
