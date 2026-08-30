'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Layers,
  Lightbulb,
  ListChecks,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, ApiError } from '@/lib/api';
import { transitions } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { LectureQuizItem, LectureStudyKit } from '@/lib/types';

type Phase = 'loading' | 'empty' | 'generating' | 'ready' | 'error';
type Tab = 'summary' | 'cards' | 'quiz';

const TABS = [
  { value: 'summary' as const, label: 'الملخص', icon: BookOpen },
  { value: 'cards' as const, label: 'البطاقات', icon: Layers },
  { value: 'quiz' as const, label: 'الاختبار', icon: ListChecks },
];

export function LectureStudyToolsModal({
  open,
  onClose,
  postId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  title: string;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [kit, setKit] = useState<LectureStudyKit | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('summary');

  const generate = useCallback(async () => {
    setPhase('generating');
    setError('');
    try {
      const { kit: fresh } = await api.post<{ kit: LectureStudyKit }>(`/ai/lectures/${postId}/study-kit`);
      setKit(fresh);
      setTab('summary');
      setPhase('ready');
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 503
            ? 'ميزة الذكاء الاصطناعي غير مُفعّلة على الخادم بعد.'
            : err.message
          : 'تعذّر توليد أدوات المذاكرة، حاول مرة أخرى.';
      setError(msg);
      setPhase('error');
    }
  }, [postId]);

  // Load the cached kit whenever the modal opens for a lecture we haven't loaded yet.
  useEffect(() => {
    if (!open) return;
    if (kit && kit.post === postId) {
      setPhase('ready');
      return;
    }
    let cancelled = false;
    setPhase('loading');
    setError('');
    api
      .get<{ kit: LectureStudyKit | null }>(`/ai/lectures/${postId}/study-kit`)
      .then(({ kit: existing }) => {
        if (cancelled) return;
        if (existing) {
          setKit(existing);
          setTab('summary');
          setPhase('ready');
        } else {
          setPhase('empty');
        }
      })
      .catch(() => {
        if (!cancelled) setPhase('empty');
      });
    return () => {
      cancelled = true;
    };
  }, [open, postId, kit]);

  return (
    <Modal open={open} onClose={onClose} title="أدوات المذاكرة" className="max-w-2xl">
      <p className="-mt-2 mb-4 truncate text-xs text-muted-foreground">{title}</p>

      {phase === 'loading' && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {phase === 'empty' && (
        <EmptyState
          icon={Sparkles}
          title="حوّل هذه المحاضرة إلى أدوات مذاكرة"
          description="يقرأ الذكاء الاصطناعي ملف المحاضرة وينشئ ملخصًا وبطاقات مراجعة واختبارًا قصيرًا. تُحفظ النتيجة وتُشارك مع بقية الطلاب."
          action={
            <Button onClick={generate}>
              <Sparkles className="h-4 w-4" />
              توليد أدوات المذاكرة
            </Button>
          }
        />
      )}

      {phase === 'generating' && (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-sm font-medium text-foreground">جارٍ إعداد أدوات المذاكرة…</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            يقرأ الذكاء الاصطناعي المحاضرة ويجهّز الملخص والبطاقات والاختبار. قد يستغرق هذا حتى نصف دقيقة.
          </p>
        </div>
      )}

      {phase === 'error' && (
        <EmptyState
          icon={AlertTriangle}
          title="تعذّر التوليد"
          description={error}
          action={
            <Button variant="outline" onClick={generate}>
              <RotateCcw className="h-4 w-4" />
              إعادة المحاولة
            </Button>
          }
        />
      )}

      {phase === 'ready' && kit && (
        <div className="space-y-4">
          <Segmented options={TABS} value={tab} onChange={setTab} fullWidth size="sm" />

          {tab === 'summary' && <SummaryView kit={kit} />}
          {tab === 'cards' && <FlashcardsView cards={kit.flashcards} />}
          {tab === 'quiz' && <QuizView items={kit.quiz} />}

          <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              أُنشئت بواسطة الذكاء الاصطناعي — راجِع المعلومات قبل الاعتماد عليها.
            </p>
            <Button variant="ghost" size="xs" onClick={generate} className="shrink-0">
              <RotateCcw className="h-3.5 w-3.5" />
              إعادة التوليد
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------------------------------- Summary ---------------------------------- */

function SummaryView({ kit }: { kit: LectureStudyKit }) {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-foreground text-pretty">{kit.overview}</p>

      {kit.keyPoints.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5" />
            أهم النقاط
          </h3>
          <ul className="space-y-1.5">
            {kit.keyPoints.map((point, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span className="leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {kit.glossary.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground">مصطلحات</h3>
          <dl className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
            {kit.glossary.map((entry, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,7rem)_1fr] gap-3 bg-surface-2/40 px-3 py-2">
                <dt className="text-xs font-semibold text-foreground">{entry.term}</dt>
                <dd className="text-xs leading-relaxed text-muted-foreground">{entry.definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Flashcards -------------------------------- */

function FlashcardsView({ cards }: { cards: LectureStudyKit['flashcards'] }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (cards.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">لا توجد بطاقات لهذه المحاضرة.</p>;
  }

  const card = cards[idx];
  const go = (delta: number) => {
    setIdx((i) => Math.min(Math.max(i + delta, 0), cards.length - 1));
    setFlipped(false);
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className={cn(
          'relative flex min-h-[168px] w-full flex-col items-center justify-center gap-2 rounded-2xl border p-6 text-center transition-colors',
          flipped ? 'border-accent/30 bg-accent/5' : 'border-border/80 bg-surface-2/40 hover:bg-surface-2/70',
        )}
      >
        <span className="absolute top-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {flipped ? 'الإجابة' : 'السؤال'}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={`${idx}-${flipped ? 'b' : 'f'}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={transitions.fade}
            className={cn(
              'block text-sm leading-relaxed text-foreground',
              !flipped && 'font-medium',
            )}
          >
            {flipped ? card.back : card.front}
          </motion.span>
        </AnimatePresence>
        {!flipped && <span className="mt-1 text-[11px] text-muted-foreground">اضغط لعرض الإجابة</span>}
      </button>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => go(-1)} disabled={idx === 0}>
          السابق
        </Button>
        <span className="text-xs font-medium text-muted-foreground">
          <bdi dir="ltr">
            {idx + 1} / {cards.length}
          </bdi>
        </span>
        <Button variant="outline" size="sm" onClick={() => go(1)} disabled={idx === cards.length - 1}>
          التالي
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------- Quiz ---------------------------------- */

function QuizView({ items }: { items: LectureQuizItem[] }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);

  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">لا يوجد اختبار لهذه المحاضرة.</p>;
  }

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === items.length;
  const score = items.reduce((n, item, i) => (answers[i] === item.answerIndex ? n + 1 : n), 0);

  const reset = () => {
    setAnswers({});
    setChecked(false);
  };

  return (
    <div className="space-y-4">
      {checked && (
        <div
          className={cn(
            'rounded-xl border px-4 py-3 text-sm font-semibold',
            score === items.length
              ? 'border-success/30 bg-success-surface text-success'
              : 'border-accent/30 bg-accent/5 text-foreground',
          )}
        >
          نتيجتك: <bdi dir="ltr">{score} / {items.length}</bdi>
        </div>
      )}

      <ol className="space-y-5">
        {items.map((item, qi) => {
          const picked = answers[qi];
          return (
            <li key={qi} className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                <span className="text-muted-foreground">{qi + 1}.</span> {item.question}
              </p>
              <div className="space-y-1.5">
                {item.options.map((opt, oi) => {
                  const isPicked = picked === oi;
                  const isCorrect = item.answerIndex === oi;
                  const showState = checked && (isPicked || isCorrect);
                  return (
                    <button
                      key={oi}
                      type="button"
                      disabled={checked}
                      onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-start text-sm transition-colors',
                        !showState && isPicked && 'border-accent/50 bg-accent/5 text-foreground',
                        !showState && !isPicked && 'border-border/70 text-muted-foreground hover:bg-surface-2/60',
                        showState && isCorrect && 'border-success/50 bg-success-surface text-success',
                        showState && isPicked && !isCorrect && 'border-danger/50 bg-danger-surface text-danger',
                        checked && !showState && 'border-border/70 text-muted-foreground opacity-70',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                          isPicked ? 'border-current' : 'border-border',
                        )}
                      >
                        {showState && isCorrect && <Check className="h-3 w-3" />}
                        {showState && isPicked && !isCorrect && <X className="h-3 w-3" />}
                      </span>
                      <span className="leading-relaxed">{opt}</span>
                    </button>
                  );
                })}
              </div>
              {checked && item.explanation && (
                <p className="rounded-lg bg-surface-2/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  {item.explanation}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex items-center justify-between gap-3">
        {checked ? (
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" />
            إعادة المحاولة
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            <bdi dir="ltr">
              {answeredCount} / {items.length}
            </bdi>{' '}
            مُجاب
          </span>
        )}
        {!checked && (
          <Button size="sm" onClick={() => setChecked(true)} disabled={!allAnswered}>
            تحقّق من الإجابات
          </Button>
        )}
      </div>
    </div>
  );
}
