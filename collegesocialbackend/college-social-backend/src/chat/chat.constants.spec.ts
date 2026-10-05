import {
  advanceStreak,
  classGroupName,
  classKeyFor,
  escapeRegex,
  isMessageEffect,
  mentionsRafed,
  parseClassKey,
  previousDayKey,
  stripRafedMention,
  messagePreviewText,
  normalizePollInput,
  POLL_LIMITS,
} from './chat.constants';

describe('normalizePollInput', () => {
  it('trims the question and options and keeps the multiple flag', () => {
    expect(normalizePollInput({ question: '  متى نذاكر؟ ', options: [' الأحد ', 'الاثنين'], multiple: true })).toEqual({
      question: 'متى نذاكر؟',
      options: ['الأحد', 'الاثنين'],
      multiple: true,
    });
  });

  it('drops empty and duplicate (case-insensitive) options', () => {
    expect(normalizePollInput({ question: 'Q', options: ['Yes', ' yes ', '', '   ', 'No'] })).toEqual({
      question: 'Q',
      options: ['Yes', 'No'],
      multiple: false,
    });
  });

  it('rejects a poll without a question or with fewer than two usable options', () => {
    expect(normalizePollInput({ question: '   ', options: ['a', 'b'] })).toBeNull();
    expect(normalizePollInput({ question: 'Q', options: ['a', 'A'] })).toBeNull();
    expect(normalizePollInput({ question: 'Q', options: 'a,b' })).toBeNull();
    expect(normalizePollInput(null)).toBeNull();
  });

  it('clips over-long text and caps the option count', () => {
    const options = Array.from({ length: 20 }, (_, i) => `option ${i} ${'x'.repeat(200)}`);
    const poll = normalizePollInput({ question: 'q'.repeat(500), options });
    expect(poll?.question).toHaveLength(POLL_LIMITS.questionMax);
    expect(poll?.options).toHaveLength(POLL_LIMITS.maxOptions);
    expect(poll?.options.every((o) => o.length <= POLL_LIMITS.optionMax)).toBe(true);
  });

  it('only treats a literal true as multiple-choice', () => {
    expect(normalizePollInput({ question: 'Q', options: ['a', 'b'], multiple: 'true' })?.multiple).toBe(false);
  });
});

describe('messagePreviewText', () => {
  it('prefers text, then the poll question, then the first attachment', () => {
    expect(messagePreviewText({ text: 'hello', poll: { question: 'Q' } })).toBe('hello');
    expect(messagePreviewText({ text: '  ', poll: { question: 'Q' } })).toBe('📊 Q');
    expect(messagePreviewText({ text: '', attachments: [{ type: 'voice' }] })).toBe('رسالة صوتية 🎤');
    expect(messagePreviewText({ text: '', attachments: [{ type: 'weird' }] })).toBe('أرسل مرفقًا');
    expect(messagePreviewText({ text: '' })).toBe('');
  });

  it('caps the preview at 120 characters', () => {
    expect(messagePreviewText({ text: 'a'.repeat(300) })).toHaveLength(120);
  });
});

describe('escapeRegex', () => {
  it('neutralises regex metacharacters so search is a plain substring match', () => {
    const input = 'a.b*(c)+[d]?^$|\\';
    expect(new RegExp(escapeRegex(input)).test(`xx${input}yy`)).toBe(true);
    expect(new RegExp(escapeRegex('a.b')).test('axb')).toBe(false);
  });
});

describe('isMessageEffect', () => {
  it('accepts only the known effects', () => {
    expect(isMessageEffect('confetti')).toBe(true);
    expect(isMessageEffect('explosion')).toBe(false);
    expect(isMessageEffect(null)).toBe(false);
  });
});

describe('advanceStreak', () => {
  const empty = { count: 0, day: null as string | null, lastSent: {} as Record<string, string> };

  it('counts a day only once both people have sent something', () => {
    const afterA = advanceStreak(empty, 'a', 'b', '2026-10-01')!;
    expect(afterA.count).toBe(0);
    const afterB = advanceStreak(afterA, 'b', 'a', '2026-10-01')!;
    expect(afterB).toEqual({ count: 1, day: '2026-10-01', lastSent: { a: '2026-10-01', b: '2026-10-01' } });
  });

  it('grows on consecutive days and restarts after a missed one', () => {
    let s: { count: number; day: string | null; lastSent: Record<string, string> } = {
      count: 3,
      day: '2026-10-01',
      lastSent: { a: '2026-10-01', b: '2026-10-01' },
    };
    s = advanceStreak(s, 'a', 'b', '2026-10-02')!;
    s = advanceStreak(s, 'b', 'a', '2026-10-02')!;
    expect(s.count).toBe(4);
    s = advanceStreak(s, 'a', 'b', '2026-10-04')!;
    s = advanceStreak(s, 'b', 'a', '2026-10-04')!;
    expect(s.count).toBe(1);
  });

  it('is a no-op for a second message the same day', () => {
    const s = { count: 2, day: '2026-10-02', lastSent: { a: '2026-10-02', b: '2026-10-02' } };
    expect(advanceStreak(s, 'a', 'b', '2026-10-02')).toBeNull();
  });

  it('handles month boundaries', () => {
    expect(previousDayKey('2026-11-01')).toBe('2026-10-31');
  });
});

describe('رافد mentions', () => {
  it('detects the mention token and a typed @رافد', () => {
    expect(mentionsRafed('@[رافد](rafed) اشرح المصفوفات')).toBe(true);
    expect(mentionsRafed('سؤال يا @رافد؟')).toBe(true);
    expect(mentionsRafed('رافد مساعد جيد')).toBe(false);
    expect(mentionsRafed('@رافدين')).toBe(false);
  });

  it('strips the mention to leave the question', () => {
    expect(stripRafedMention('@[رافد](rafed)  اشرح  المصفوفات')).toBe('اشرح المصفوفات');
    expect(stripRafedMention('@رافد ما هو الـ API؟')).toBe('ما هو الـ API؟');
  });
});

describe('class groups', () => {
  it('builds a key only for a known department + year', () => {
    expect(classKeyFor('engineering', 'year3')).toBe('engineering:year3');
    expect(classKeyFor('engineering', null)).toBeNull();
    expect(classKeyFor('unknown', 'year1')).toBeNull();
    expect(parseClassKey('engineering:year3')).toEqual({ department: 'engineering', academicYear: 'year3' });
    expect(parseClassKey('bogus')).toBeNull();
  });

  it('names the group in Arabic', () => {
    expect(classGroupName('engineering', 'year3')).toBe('دفعة السنة الثالثة · شعبة هندسة');
  });
});

describe('messagePreviewText (cards, stickers, رافد)', () => {
  it('previews a shared card by its title', () => {
    expect(messagePreviewText({ text: '', card: { kind: 'assignment', title: 'تقرير المعمل' } })).toBe('📝 تقرير المعمل');
  });

  it('labels a sticker', () => {
    expect(messagePreviewText({ text: '', attachments: [{ type: 'sticker' }] })).toBe('ملصق ✨');
  });

  it('shows the رافد mention token as @رافد', () => {
    expect(messagePreviewText({ text: '@[رافد](rafed) ساعدني' })).toBe('@رافد ساعدني');
  });
});
