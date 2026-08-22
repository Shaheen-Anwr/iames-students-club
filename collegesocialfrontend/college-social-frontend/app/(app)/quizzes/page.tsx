import { QuizzesBoard } from '@/components/quizzes/QuizzesBoard';

export default function QuizzesPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <QuizzesBoard />
      </div>
    </div>
  );
}
