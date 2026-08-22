import { QuestionDetail } from '@/components/qa/QuestionDetail';

export default function QaQuestionPage({ params }: { params: { id: string } }) {
  return <QuestionDetail questionId={params.id} />;
}
