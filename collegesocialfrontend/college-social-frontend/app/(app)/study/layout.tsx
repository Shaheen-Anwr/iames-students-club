import { StudyTabs } from '@/components/study/StudyTabs';

export default function StudyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-4xl px-4 py-4">
        <StudyTabs />
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
