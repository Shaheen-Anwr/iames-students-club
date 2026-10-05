import {
  escapeRegex,
  isMessageEffect,
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
