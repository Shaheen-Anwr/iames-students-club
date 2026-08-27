import type { Department } from './departments';
import type { AcademicYear } from './academic-years';
import type { Specialization } from './specializations';
import type { GradeLetter } from './gpa';

export type Role = 'student' | 'professor' | 'admin';

export const ROLE_LABELS: Record<Role, string> = { student: 'طالب', professor: 'أستاذ', admin: 'مدير' };

export interface User {
  _id: string;
  collegeId: string;
  name: string;
  collegeEmail: string;
  collegeEmailVerifiedAt?: string | null;
  personalEmail?: string | null;
  photoUrl?: string | null;
  coverPhotoUrl?: string | null;
  role: Role;
  isActive?: boolean;
  createdAt?: string;
  bio?: string | null;
  department?: Department | null;
  academicYear?: AcademicYear | null;
  specialization?: Specialization | null;
  points?: number;
  streakCount?: number;
  badges?: string[];
  referredBy?: string | null;
  referralCount?: number;
  isOnline?: boolean;
  lastSeenAt?: string | null;
  blockedUsers?: string[];
  friends?: string[];
  friendRequestsSent?: string[];
  friendRequestsReceived?: string[];
}

export type BadgeId =
  | 'first_post'
  | 'active_streak_7'
  | 'helpful_10'
  | 'assignments_5'
  | 'quizzes_5'
  | 'referral_5';

export const BADGE_META: Record<BadgeId, { label: string; description: string; icon: string }> = {
  first_post: { label: 'أول منشور', description: 'شاركت أول منشور لك', icon: '📝' },
  active_streak_7: { label: 'مثابر', description: 'نشط لمدة 7 أيام متتالية', icon: '🔥' },
  helpful_10: { label: 'متفاعل', description: 'حصل منشورك على 10 تفاعلات', icon: '🤝' },
  assignments_5: { label: 'مجتهد', description: 'أكملت 5 واجبات', icon: '🎯' },
  quizzes_5: { label: 'عبقري الاختبارات', description: 'حللت 5 اختبارات', icon: '🧠' },
  referral_5: { label: 'سفير المنصة', description: 'دعوت 5 من أصدقائك للانضمام', icon: '📣' },
};

// Friends a student must invite (who sign up with their link) to earn the referral_5 badge.
export const REFERRAL_TARGET = 5;

export interface LeaderboardEntry {
  _id: string;
  name: string;
  photoUrl?: string | null;
  role: Role;
  points: number;
  streakCount: number;
}

export interface PaginatedUsers {
  data: User[];
  total: number;
  page: number;
  limit: number;
}

export type PostAttachmentType = 'lecture' | 'video' | 'file' | 'image' | 'none';

export type ReactionType = 'like' | 'dislike' | 'care' | 'support' | 'not_interested' | 'sad' | 'angry';

export const REACTION_META: Record<ReactionType, { emoji: string; label: string }> = {
  like: { emoji: '👍', label: 'إعجاب' },
  dislike: { emoji: '👎', label: 'عدم إعجاب' },
  care: { emoji: '🤗', label: 'اهتمام' },
  support: { emoji: '🙌', label: 'دعم' },
  not_interested: { emoji: '🙅', label: 'غير مهتم' },
  sad: { emoji: '😢', label: 'حزين' },
  angry: { emoji: '😠', label: 'غاضب' },
};

export interface Reaction {
  user: string;
  type: ReactionType;
}

export interface Comment {
  _id: string;
  post: string;
  // null when the commenter's account has since been deleted.
  author: User | null;
  text: string;
  edited?: boolean;
  // Null for a top-level comment; set to the parent's id for a reply.
  parentComment: string | null;
  replyCount: number;
  reactions: Reaction[];
  createdAt: string;
}

// A reactor entry with the user populated, from GET /posts/:id/reactions and
// GET /posts/comments/:commentId/reactions -- used by the "seen by" modal.
export interface PopulatedReaction {
  user: User;
  type: ReactionType;
}

// 'friends' -> visible to the author + their friends; 'private' -> the author only ("only me").
// 'public'/'department' are the feed tabs; the latter also doubles as a browse tag.
export type PostScope = 'public' | 'department' | 'friends' | 'private';

export interface Post {
  _id: string;
  // null when the author's account has since been deleted.
  author: User | null;
  caption: string;
  edited?: boolean;
  attachmentType: PostAttachmentType;
  attachmentUrl?: string | null;
  attachmentOriginalName?: string | null;
  attachmentSize?: number | null;
  // >1 when the original upload was too large for a single Cloudinary asset and got split (see the
  // backend's StorageService.upload()). Only meaningful for 'lecture'/'file' -- fetch such an
  // attachment via `/posts/${_id}/attachment` (assetUrl-style helper) rather than attachmentUrl
  // directly so the backend can transparently reassemble it. 'video' needs no such handling:
  // attachmentUrl is already a complete, directly playable Cloudinary URL either way.
  attachmentChunkCount?: number | null;
  // Only set when attachmentType is 'image' -- a multi-photo post.
  images?: string[];
  courseCode?: string | null;
  scope: PostScope;
  // Snapshotted from the author's profile at post time (or an explicit tag for a lecture/video
  // library upload, see components/lectures/) -- used to filter the feed.
  department?: Department | null;
  academicYear?: AcademicYear | null;
  specialization?: Specialization | null;
  reactions: Reaction[];
  savedBy: string[];
  commentCount: number;
  // Set when this post is a share -- the original post being shared (or null if it's since been
  // deleted). A regular, never-shared post has this as undefined/null.
  sharedFrom?: Post | null;
  // Denormalized count of posts sharing this one (only meaningful when sharedFrom is unset).
  shareCount?: number;
  createdAt: string;
}

export interface CourseSummary {
  courseCode: string;
  attachmentCount: number;
  latestAt: string;
}

export interface LectureFolder {
  id: string | null;
  name: string;
  lectureCount: number;
  latestAt: string;
  createdAt: string;
}

export interface PaginatedPosts {
  data: Post[];
  total: number;
  page: number;
  limit: number;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface AdminUserStats {
  total: number;
  students: number;
  professors: number;
  admins: number;
  active: number;
  verified: number;
  online: number;
  dailySignups: DailyCount[];
  byDepartment: Record<string, number>;
}

export interface AdminPostStats {
  totalPosts: number;
  totalComments: number;
  totalReplies: number;
  totalReactions: number;
  dailyPosts: DailyCount[];
}

export interface AdminGroupStats {
  totalGroups: number;
  publicGroups: number;
  privateGroups: number;
  totalChannels: number;
  totalMessages: number;
  avgMembersPerGroup: number;
}

export interface AdminQuizStats {
  totalQuizzes: number;
  totalAttempts: number;
  avgScorePercent: number;
  dailyAttempts: DailyCount[];
}

export interface AdminAssignmentStats {
  totalAssignments: number;
  totalCompletions: number;
  avgCompletionsPerAssignment: number;
  overdue: number;
}

export interface AdminAnnouncementStats {
  total: number;
  pinned: number;
  platformWide: number;
  byDepartment: Record<string, number>;
}

export interface AdminGamificationStats {
  totalPointsAwarded: number;
  avgPoints: number;
  avgStreak: number;
  usersWithStreak: number;
  badgeCounts: Record<string, number>;
}

export interface AdminQaStats {
  totalQuestions: number;
  totalAnswers: number;
  acceptedAnswers: number;
  unanswered: number;
}

export interface AdminChatStats {
  totalConversations: number;
  groupConversations: number;
  totalMessages: number;
  dailyMessages: DailyCount[];
}

export interface AdminLectureIndexStats {
  totalChunks: number;
  indexedSources: number;
  byDepartment: Record<string, number>;
}

export interface AdminAiStats {
  totalConversations: number;
  totalMessages: number;
  dailyMessages: DailyCount[];
  lectureIndex: AdminLectureIndexStats;
}

export interface AdminScheduleStats {
  totalEntries: number;
  groupsCovered: number;
  avgEntriesPerGroup: number;
}

export interface AdminPlannerStats {
  totalTasks: number;
  doneTasks: number;
  usersWithTasks: number;
  avgTasksPerUser: number;
}

export interface AdminNotificationStats {
  total: number;
  unread: number;
  readRatePercent: number;
  byType: Record<string, number>;
}

export interface AdminStats {
  users: AdminUserStats;
  posts: AdminPostStats;
  groups: AdminGroupStats;
  quizzes: AdminQuizStats;
  assignments: AdminAssignmentStats;
  announcements: AdminAnnouncementStats;
  gamification: AdminGamificationStats;
  qa: AdminQaStats;
  chat: AdminChatStats;
  ai: AdminAiStats;
  schedule: AdminScheduleStats;
  planner: AdminPlannerStats;
  notifications: AdminNotificationStats;
}

// --- Admin moderation list shapes (distinct from the public-facing types above, since admin
// list endpoints return summarized/unpopulated-differently shapes and paginate) ---

export interface PaginatedGroups {
  data: StudyGroup[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminQuizListItem {
  _id: string;
  createdBy: User | null;
  title: string;
  courseCode: string | null;
  questionCount: number;
  attemptCount: number;
  createdAt: string;
}

export interface PaginatedAdminQuizzes {
  data: AdminQuizListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedAssignments {
  data: Assignment[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedAnnouncements {
  data: Announcement[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedQuestions {
  data: Question[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminConversationSummary {
  _id: string;
  participants: (User | null)[];
  isGroup: boolean;
  name?: string | null;
  lastMessageAt?: string | null;
  createdAt: string;
}

export interface PaginatedAdminConversations {
  data: AdminConversationSummary[];
  total: number;
  page: number;
  limit: number;
}

// Live feed pushed to admin dashboards over the existing /chat socket -- see admin:presence /
// admin:activity events emitted by RealtimeEmitterService.emitToAdmins().
export interface AdminActivityEvent {
  type: 'signup' | 'post' | 'moderation';
  summary: string;
  at: string;
}

export interface Assignment {
  _id: string;
  // null when the creator's account has since been deleted.
  createdBy: User | null;
  title: string;
  description: string;
  courseCode: string;
  dueDate: string;
  attachmentType: PostAttachmentType;
  attachmentUrl?: string | null;
  attachmentOriginalName?: string | null;
  completedBy: string[];
  createdAt: string;
  isPersonal?: boolean;
  // true for التربية العسكرية assignments -- shown in /study/military, hidden from the normal board.
  isMilitary?: boolean;
  // Set only for assignments created inside a study group -- null/absent for every global one.
  group?: string | null;
}

// --- التربية العسكرية (military education) ---

export interface MilitaryPeriod {
  startDate: string;
  endDate: string;
  title: string;
  motivationalQuotes: string[];
}

export interface MilitaryStatus {
  period: MilitaryPeriod | null;
  streak: number;
  checkedInToday: boolean;
  totalCheckIns: number;
  daysTotal: number;
  daysElapsed: number;
  daysRemaining: number;
  isActive: boolean;
  quote: string | null;
}

export interface MilitaryScheduleItem {
  _id: string;
  date: string;
  title: string;
  startTime: string;
  endTime: string;
  location: string | null;
}

export interface MilitaryTodo {
  _id: string;
  text: string;
  done: boolean;
  order: number;
}

export interface MilitaryStudentSettings {
  dailyStartTime: string | null;
  dailyEndTime: string | null;
}

export interface MilitaryOverview {
  period: MilitaryPeriod | null;
  myStatus: MilitaryStatus;
  schedule: MilitaryScheduleItem[];
  settings: MilitaryStudentSettings;
  todos: MilitaryTodo[];
}

export interface MilitaryRosterEntry {
  user: { _id: string; name: string; photoUrl?: string | null; collegeId: string };
  completed: number;
  total: number;
  streak: number;
  attendedDays: number;
  lastCheckIn: string | null;
}

export interface MilitaryRoster {
  totalAssignments: number;
  students: MilitaryRosterEntry[];
  // Size of the admin-uploaded unit name list (0 when none was uploaded and every student shows).
  rosterCount: number;
  // Roster names that matched no account, or matched more than one.
  unmatchedNames: string[];
}

export interface MilitaryRosterUploadResult {
  total: number;
  matched: number;
  unmatched: number;
  unmatchedNames: string[];
}

// Public question shape -- correctIndex is only present once the viewer has attempted the quiz
// (or is its creator), matching what QuizzesService.toDetail sends from the backend.
export interface QuizQuestion {
  text: string;
  options: string[];
  correctIndex?: number;
}

export interface QuizMyAttempt {
  score: number;
  answers: number[];
}

export interface QuizSummary {
  _id: string;
  // null when the creator's account has since been deleted.
  createdBy: User | null;
  title: string;
  description: string;
  courseCode: string | null;
  questionCount: number;
  attemptCount: number;
  myScore: number | null;
  createdAt: string;
  // Set only for quizzes created inside a study group -- null/absent for every global one.
  group?: string | null;
}

export interface QuizDetail {
  _id: string;
  createdBy: User | null;
  title: string;
  description: string;
  courseCode: string | null;
  attemptCount: number;
  createdAt: string;
  myAttempt: QuizMyAttempt | null;
  questions: QuizQuestion[];
}

export interface QuizAttemptResult {
  score: number;
  total: number;
  correctIndexes: number[];
}

export type CalendarEventType = 'class' | 'assignment' | 'task' | 'announcement' | 'event' | 'reminder';

export interface CalendarEvent {
  date: string;
  type: CalendarEventType;
  title: string;
  startTime?: string;
  endTime?: string;
  location?: string | null;
  id?: string;
  courseCode?: string;
  // event/reminder only
  notes?: string | null;
}

export interface PlannerTask {
  _id: string;
  owner: string;
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  done: boolean;
  courseCode?: string | null;
  createdAt: string;
}

export interface Announcement {
  _id: string;
  // null when the author's account has since been deleted.
  author: User | null;
  title: string;
  body: string;
  department?: Department | null;
  pinned: boolean;
  eventDate?: string | null;
  createdAt: string;
}

export type Urgency = 'overdue' | 'urgent' | 'normal' | 'completed';

export interface DueItem {
  type: 'assignment' | 'planner';
  id: string;
  title: string;
  courseCode: string | null;
  dueDate: string;
  urgency: Urgency;
}

export interface DashboardResponse {
  todaySchedule: ScheduleEntry[];
  dueToday: DueItem[];
  leaderboard: LeaderboardEntry[];
  announcements: Announcement[];
}

export interface SearchResults {
  posts: Post[];
  questions: Question[];
  groups: StudyGroup[];
  users: User[];
}

export interface ScheduleEntry {
  _id: string;
  createdBy: string;
  department: string;
  academicYear: string;
  specialization: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  courseName: string;
  startTime: string;
  endTime: string;
  location?: string | null;
  createdAt: string;
}

export interface MutedEntry {
  user: string;
  until: string | null;
}

export interface Conversation {
  _id: string;
  // entries are null for a participant whose account has since been deleted.
  participants: (User | null)[];
  isGroup: boolean;
  name?: string | null;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  updatedAt?: string;
  createdBy?: string | null;
  groupIcon?: string | null;
  groupDescription?: string | null;
  admins?: string[];
  pinnedBy?: string[];
  archivedBy?: string[];
  mutedBy?: MutedEntry[];
  disappearingSeconds?: number;
  unreadCount?: number;
}

export type AttachmentType = 'image' | 'video' | 'audio' | 'voice' | 'document';

export interface Attachment {
  url: string;
  type: AttachmentType;
  name?: string | null;
  size?: number | null;
  mimeType?: string | null;
  duration?: number | null;
}

export interface MessageReaction {
  user: { _id: string; name: string } | string;
  emoji: string;
}

export interface ReplyPreview {
  _id: string;
  text: string;
  sender: { _id: string; name: string } | null;
  attachments?: Attachment[];
  deletedForEveryone?: boolean;
}

export interface Message {
  _id: string;
  conversation: string;
  // null when the sender's account has since been deleted.
  sender: User | null;
  text: string;
  /** @deprecated use `attachments` */
  attachmentUrl?: string | null;
  attachments?: Attachment[];
  replyTo?: ReplyPreview | null;
  reactions?: MessageReaction[];
  edited?: boolean;
  editedAt?: string | null;
  deletedForEveryone?: boolean;
  forwarded?: boolean;
  starredBy?: string[];
  readBy: string[];
  deliveredTo?: string[];
  createdAt: string;
}

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

export interface SharedMediaItem {
  _id: string;
  url: string;
  type: AttachmentType;
  createdAt: string;
}

export interface SharedFileItem extends SharedMediaItem {
  name: string | null;
  size: number | null;
}

export interface SharedLinkItem {
  messageId: string;
  url: string;
  createdAt: string;
}

export interface SharedMedia {
  media: SharedMediaItem[];
  files: SharedFileItem[];
  links: SharedLinkItem[];
}

export interface UploadResult {
  url: string;
  // >1 when the file was too large for a single Cloudinary asset and got split -- see Post's
  // attachmentChunkCount and the backend's StorageService.upload(). Absent/1 for a normal upload.
  chunkCount?: number;
  originalName?: string;
  size: number;
  mimeType: string;
}

export type GroupVisibility = 'public' | 'private';

export interface StudyGroup {
  _id: string;
  name: string;
  description?: string | null;
  owner: string;
  members: string[];
  visibility: GroupVisibility;
  inviteCode: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface Channel {
  _id: string;
  group: string;
  name: string;
  createdAt: string;
}

export interface ChannelMessage {
  _id: string;
  channel: string;
  // null when the sender's account has since been deleted.
  sender: User | null;
  text: string;
  attachmentUrl?: string | null;
  createdAt: string;
}

export type NotificationType =
  | 'chat_message'
  | 'channel_message'
  | 'post_comment'
  | 'post_reaction'
  | 'post_share'
  | 'comment_reply'
  | 'comment_reaction'
  | 'qa_answer'
  | 'friend_request'
  | 'friend_accept';

export interface Notification {
  _id: string;
  recipient: string;
  // null when the actor's account has since been deleted.
  actor: User | null;
  type: NotificationType;
  conversationId?: string | null;
  channelId?: string | null;
  groupId?: string | null;
  postId?: string | null;
  questionId?: string | null;
  preview?: string | null;
  read: boolean;
  createdAt: string;
}

export interface Question {
  _id: string;
  // null when the author's account has since been deleted.
  author: User | null;
  title: string;
  body: string;
  courseCode?: string | null;
  scope: PostScope;
  department?: Department | null;
  answerCount: number;
  createdAt: string;
  // Set only for questions asked inside a study group -- null/absent for every global one.
  group?: string | null;
}

export interface Answer {
  _id: string;
  question: string;
  // null when the author's account has since been deleted.
  author: User | null;
  body: string;
  upvotes: string[];
  isAccepted: boolean;
  createdAt: string;
}

export interface AiConversation {
  _id: string;
  owner: string;
  title: string | null;
  createdAt: string;
  updatedAt?: string;
}

export type AiMessageRole = 'user' | 'assistant';

export interface AiMessageSource {
  label: string;
  ref?: string;
}

export interface AiMessage {
  _id: string;
  conversation: string;
  role: AiMessageRole;
  text: string;
  sources?: AiMessageSource[];
  // Human-readable receipts of platform actions the assistant actually took while answering this
  // turn (e.g. "✓ أضاف مهمة: ..."), only ever populated on 'assistant' messages.
  actions?: string[];
  // Set on a 'user' message when the student attached a file/image.
  attachmentUrl?: string | null;
  attachmentType?: 'image' | 'document' | null;
  // Set on a 'user' message when the student shared an existing feed post into the chat.
  sharedPostId?: string | null;
  // True when this 'assistant' reply is the stub fallback (AI not configured, or the request
  // failed) rather than a genuine model answer -- render as a setup/outage notice, not an answer.
  stub?: boolean;
  createdAt: string;
}

// --- GPA calculator (src/gpa) ---

export interface GpaCourse {
  _id: string;
  owner: string;
  name: string;
  creditHours: number;
  grade: GradeLetter | null;
  term: string;
  countsTowardGpa: boolean;
  createdAt: string;
}

export interface GpaTermSummary {
  term: string;
  gpa: number;
  credits: number;
}

export interface GpaSummary {
  cumulative: { gpa: number; credits: number; points: number };
  terms: GpaTermSummary[];
  gradedCredits: number;
  totalCredits: number;
}

export interface GpaResponse {
  courses: GpaCourse[];
  summary: GpaSummary;
}

// --- Attendance tracker (src/attendance) ---

export type AttendanceStatus = 'attended' | 'absent' | 'excused' | 'cancelled';

export interface AttendanceOccurrence {
  scheduleEntryId: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  courseName: string;
  startTime: string;
  endTime: string;
  location: string | null;
  status: AttendanceStatus | null;
}

export interface AttendanceWeek {
  weekStart: string;
  occurrences: AttendanceOccurrence[];
}

export interface AttendanceCourseSummary {
  courseName: string;
  attended: number;
  absent: number;
  excused: number;
  cancelled: number;
  counted: number;
  percent: number;
}

export interface AttendanceSummary {
  courses: AttendanceCourseSummary[];
  overall: AttendanceCourseSummary;
}
