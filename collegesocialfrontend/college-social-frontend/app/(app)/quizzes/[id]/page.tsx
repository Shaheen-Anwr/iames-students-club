import { QuizDetailView } from '@/components/quizzes/QuizDetailView';

export default function QuizPage({ params }: { params: { id: string } }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <QuizDetailView quizId={params.id} />
      </div>
    </div>
  );
}
