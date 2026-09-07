import { QuizzesBoard } from '@/components/quizzes/QuizzesBoard';
import { StudyTabs } from '@/components/study/StudyTabs';

// Lives outside /study/* (deep-linked from quiz notifications), but it's part of the study hub --
// carry the same tab strip so "الاختبارات" doesn't drop the student out of the hub.
export default function QuizzesPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <StudyTabs />
        <div className="mt-4">
          <QuizzesBoard />
        </div>
      </div>
    </div>
  );
}
