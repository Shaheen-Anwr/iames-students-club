// Arabic text stickers ("sticker:text/<id>") -- original artwork for this app, drawn with CSS in the
// app's own font (see components/chat/StickerView.tsx), so they cost no image downloads and stay
// crisp at any size. Campus phrases in Egyptian Arabic, the way students actually talk.

export type TextStickerStyle = 'pop' | 'outline' | 'note' | 'badge';

export interface TextSticker {
  id: string;
  text: string;
  emoji?: string;
  style: TextStickerStyle;
  /** Two colours: gradient stops for pop/badge, text + shadow tint for outline, paper for note. */
  colors: [string, string];
  /** Small tilt in degrees -- hand-placed, so a grid of them doesn't look stamped. */
  tilt?: number;
}

const INDIGO: [string, string] = ['#8B7CFF', '#5A50E0'];
const AMBER: [string, string] = ['#FBBF24', '#F59E0B'];
const ROSE: [string, string] = ['#FB7185', '#E11D48'];
const EMERALD: [string, string] = ['#34D399', '#059669'];
const SKY: [string, string] = ['#38BDF8', '#0284C7'];
const FUCHSIA: [string, string] = ['#E879F9', '#A21CAF'];
const ORANGE: [string, string] = ['#FB923C', '#EA580C'];
const NOTE_YELLOW: [string, string] = ['#FEF08A', '#FDE047'];
const NOTE_PINK: [string, string] = ['#FBCFE8', '#F9A8D4'];
const NOTE_GREEN: [string, string] = ['#BBF7D0', '#86EFAC'];

export const TEXT_STICKERS: TextSticker[] = [
  // Studying
  { id: 'studied', text: 'ذاكرت؟', emoji: '📚', style: 'pop', colors: INDIGO, tilt: -4 },
  { id: 'lets-study', text: 'يلا نذاكر', emoji: '💪', style: 'outline', colors: INDIGO, tilt: 3 },
  { id: 'exam-tomorrow', text: 'امتحان بكرة', emoji: '😭', style: 'pop', colors: ROSE, tilt: 4 },
  { id: 'submitted', text: 'تم التسليم', emoji: '✅', style: 'badge', colors: EMERALD },
  { id: 'who-has-summary', text: 'مين معاه الملخص؟', emoji: '📄', style: 'note', colors: NOTE_YELLOW, tilt: -3 },
  { id: 'doctor-late', text: 'الدكتور اتأخر', emoji: '⏰', style: 'outline', colors: ORANGE, tilt: -2 },
  { id: 'lecture-canceled', text: 'المحاضرة اتلغت', emoji: '🎉', style: 'pop', colors: EMERALD, tilt: -5 },
  { id: 'study-morning', text: 'صباح المذاكرة', emoji: '☕', style: 'note', colors: NOTE_YELLOW, tilt: 2 },
  { id: 'leave-me-study', text: 'سيبني أذاكر', emoji: '📖', style: 'outline', colors: SKY, tilt: 2 },
  { id: 'where-section', text: 'السكشن فين؟', emoji: '📍', style: 'pop', colors: SKY, tilt: -3 },
  { id: 'where-sheet', text: 'الشيت فين؟', emoji: '📝', style: 'note', colors: NOTE_PINK, tilt: 3 },
  { id: 'send-pdf', text: 'ابعتلي الـ PDF', emoji: '📎', style: 'pop', colors: FUCHSIA, tilt: 3 },
  { id: 'how-many-days', text: 'فاضل كام يوم؟', emoji: '📅', style: 'outline', colors: ROSE, tilt: -3 },
  { id: 'important-q', text: 'سؤال مهم', emoji: '❓', style: 'badge', colors: ORANGE },
  { id: 'got-it', text: 'فهمت', emoji: '💡', style: 'pop', colors: AMBER, tilt: -4 },
  { id: 'lost', text: 'مش فاهم حاجة', emoji: '🤯', style: 'outline', colors: FUCHSIA, tilt: 3 },
  { id: 'done', text: 'خلصت', emoji: '🙌', style: 'badge', colors: INDIGO },
  { id: 'coffee-first', text: 'قهوة الأول', emoji: '☕', style: 'note', colors: NOTE_GREEN, tilt: -2 },
  { id: 'who-comes-uni', text: 'مين جاي الجامعة؟', emoji: '🏫', style: 'pop', colors: INDIGO, tilt: 3 },
  { id: 'we-passed', text: 'نجحنا', emoji: '🎓', style: 'badge', colors: AMBER },
  // Replies
  { id: 'ok', text: 'تمام', emoji: '👌', style: 'pop', colors: EMERALD, tilt: 4 },
  { id: 'sure', text: 'أكيد', emoji: '💯', style: 'outline', colors: EMERALD, tilt: -3 },
  { id: 'fine', text: 'ماشي', style: 'note', colors: NOTE_GREEN, tilt: 3 },
  { id: 'yes-sir', text: 'حاضر', emoji: '🫡', style: 'pop', colors: SKY, tilt: -3 },
  { id: 'no', text: 'لأ', emoji: '🙅', style: 'badge', colors: ROSE },
  { id: 'agreed', text: 'متفقين', emoji: '🤝', style: 'outline', colors: INDIGO, tilt: 2 },
  { id: 'really', text: 'بجد؟', emoji: '😳', style: 'pop', colors: ORANGE, tilt: 5 },
  { id: 'no-way', text: 'لا يا شيخ', emoji: '😂', style: 'outline', colors: AMBER, tilt: -4 },
  { id: 'haha', text: 'هههههه', emoji: '😂', style: 'pop', colors: AMBER, tilt: -2 },
  { id: 'no-worries', text: 'ولا يهمك', emoji: '😎', style: 'outline', colors: SKY, tilt: 3 },
  { id: 'thanks', text: 'شكرًا جدًا', emoji: '💜', style: 'pop', colors: FUCHSIA, tilt: -3 },
  { id: 'bless-hands', text: 'تسلم إيدك', emoji: '🙏', style: 'note', colors: NOTE_PINK, tilt: -3 },
  { id: 'tired', text: 'أنا تعبت', emoji: '🥲', style: 'outline', colors: ROSE, tilt: 2 },
  // On my way / where are you
  { id: 'coming', text: 'أنا جاي', emoji: '🏃', style: 'pop', colors: ORANGE, tilt: -4 },
  { id: 'on-the-way', text: 'في الطريق', emoji: '🚗', style: 'outline', colors: ORANGE, tilt: 3 },
  { id: 'waiting', text: 'مستنيك', emoji: '⏳', style: 'note', colors: NOTE_YELLOW, tilt: 2 },
  { id: 'sleeping', text: 'نايم', emoji: '😴', style: 'badge', colors: SKY },
  { id: 'group-asleep', text: 'الجروب نام؟', emoji: '👀', style: 'pop', colors: INDIGO, tilt: 3 },
  { id: 'anyone-awake', text: 'حد صاحي؟', emoji: '🌙', style: 'outline', colors: INDIGO, tilt: -3 },
  // Cheering & occasions
  { id: 'you-got-this', text: 'قدها وقدود', emoji: '💪', style: 'pop', colors: EMERALD, tilt: -3 },
  { id: 'beast', text: 'عاش يا وحش', emoji: '🔥', style: 'outline', colors: ORANGE, tilt: 4 },
  { id: 'good-luck', text: 'بالتوفيق', emoji: '🍀', style: 'badge', colors: EMERALD },
  { id: 'god-help', text: 'ربنا يستر', emoji: '🤲', style: 'note', colors: NOTE_GREEN, tilt: 2 },
  { id: 'congrats', text: 'مبروك', emoji: '🎉', style: 'pop', colors: FUCHSIA, tilt: 4 },
  { id: 'birthday', text: 'كل سنة وانت طيب', emoji: '🎂', style: 'pop', colors: ROSE, tilt: -3 },
  { id: 'ramadan', text: 'رمضان كريم', emoji: '🌙', style: 'badge', colors: AMBER },
  { id: 'eid', text: 'عيد سعيد', emoji: '🎈', style: 'outline', colors: FUCHSIA, tilt: 3 },
  { id: 'jumuah', text: 'جمعة مباركة', emoji: '🕌', style: 'note', colors: NOTE_GREEN, tilt: -2 },
];
