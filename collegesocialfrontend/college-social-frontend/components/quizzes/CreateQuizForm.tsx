'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import type { QuizSummary } from '@/lib/types';

interface DraftQuestion {
  text: string;
  options: string[];
  correctIndex: number;
}

function emptyQuestion(): DraftQuestion {
  return { text: '', options: ['', ''], correctIndex: 0 };
}

export function CreateQuizForm({
  groupId,
  onCreated,
  onClose,
}: {
  groupId?: string;
  onCreated: (quiz: QuizSummary) => void;
  onClose: () => void;
}) {
  const { showToast } = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [submitting, setSubmitting] = useState(false);

  function updateQuestion(index: number, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function updateOption(qIndex: number, oIndex: number, value: string) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIndex ? { ...q, options: q.options.map((o, j) => (j === oIndex ? value : o)) } : q)),
    );
  }

  function addOption(qIndex: number) {
    setQuestions((prev) => prev.map((q, i) => (i === qIndex && q.options.length < 6 ? { ...q, options: [...q.options, ''] } : q)));
  }

  function removeOption(qIndex: number, oIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex || q.options.length <= 2) return q;
        const options = q.options.filter((_, j) => j !== oIndex);
        const correctIndex = q.correctIndex === oIndex ? 0 : q.correctIndex > oIndex ? q.correctIndex - 1 : q.correctIndex;
        return { ...q, options, correctIndex };
      }),
    );
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      showToast('عنوان الاختبار مطلوب.', 'error');
      return;
    }
    for (const [i, q] of questions.entries()) {
      if (!q.text.trim() || q.options.some((o) => !o.trim())) {
        showToast(`أكمل نص السؤال ${i + 1} وخياراته.`, 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      const quiz = await api.post<QuizSummary>(groupId ? `/quizzes/group/${groupId}` : '/quizzes', {
        title: title.trim(),
        description: description.trim() || undefined,
        courseCode: courseCode.trim() || undefined,
        questions: questions.map((q) => ({ text: q.text.trim(), options: q.options.map((o) => o.trim()), correctIndex: q.correctIndex })),
      });
      onCreated(quiz);
      showToast('تم إنشاء الاختبار.');
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إنشاء الاختبار.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto scrollbar-thin ps-0.5">
      <Input label="عنوان الاختبار" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: اختبار الفصل الأول" required />

      <Textarea rows={2} placeholder="وصف الاختبار (اختياري)" value={description} onChange={(e) => setDescription(e.target.value)} />

      <Input label="رمز المقرر (اختياري)" value={courseCode} onChange={(e) => setCourseCode(e.target.value)} placeholder="مثال: CS101" />

      <div className="space-y-4">
        {questions.map((question, qIndex) => (
          <div key={qIndex} className="space-y-2.5 rounded-xl2 border border-border bg-surface-2/70 p-3.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">سؤال {qIndex + 1}</span>
              {questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeQuestion(qIndex)}
                  className="ms-auto rounded-full p-1 text-muted-foreground transition-transform hover:scale-110 hover:bg-danger/10 hover:text-danger active:scale-95"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Input
              value={question.text}
              onChange={(e) => updateQuestion(qIndex, { text: e.target.value })}
              placeholder="نص السؤال"
              required
            />

            <div className="space-y-1.5">
              {question.options.map((option, oIndex) => (
                <div key={oIndex} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateQuestion(qIndex, { correctIndex: oIndex })}
                    title="الإجابة الصحيحة"
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-all active:scale-95',
                      question.correctIndex === oIndex
                        ? 'border-success bg-success/15 text-success'
                        : 'border-border text-muted-foreground hover:bg-surface',
                    )}
                  >
                    {String.fromCharCode(65 + oIndex)}
                  </button>
                  <Input
                    value={option}
                    onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                    placeholder={`خيار ${String.fromCharCode(65 + oIndex)}`}
                    className="flex-1 rounded-full border-transparent bg-surface"
                    required
                  />
                  {question.options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(qIndex, oIndex)}
                      className="rounded-full p-1.5 text-muted-foreground transition-transform hover:scale-110 hover:bg-danger/10 hover:text-danger active:scale-95"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {question.options.length < 6 && (
              <button type="button" onClick={() => addOption(qIndex)} className="text-xs font-medium text-accent hover:underline">
                + إضافة خيار
              </button>
            )}
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={addQuestion} className="w-full">
        <Plus className="h-4 w-4" />
        إضافة سؤال
      </Button>

      <Button type="submit" loading={submitting} className="w-full">
        إنشاء الاختبار
      </Button>
    </form>
  );
}
