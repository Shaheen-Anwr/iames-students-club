import { LecturesBrowser } from '@/components/lectures/LecturesBrowser';

export default function PdfLecturesPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <LecturesBrowser
        attachmentType="lecture"
        uploadAccept=".pdf"
        title="محاضرات PDF"
        uploadLabel="رفع محاضرة"
        emptyLabel="لا توجد محاضرات بعد. كن أول من يرفع محاضرة."
      />
    </div>
  );
}
