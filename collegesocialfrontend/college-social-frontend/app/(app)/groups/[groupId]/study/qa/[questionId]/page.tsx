import { QuestionDetail } from '@/components/qa/QuestionDetail';

export default function GroupQaQuestionPage({ params }: { params: { questionId: string } }) {
  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto p-4 scrollbar-thin md:p-6">
      <QuestionDetail questionId={params.questionId} />
    </div>
  );
}
