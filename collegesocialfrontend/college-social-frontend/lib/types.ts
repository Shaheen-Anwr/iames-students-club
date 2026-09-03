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
  // A strict subset of `role: 'admin'`. Only super admins may manage user accounts (the admin
  // "Users" panel); regular admins keep every other panel. Backfilled server-side so the oldest
  // admin always has it.
  isSuperAdmin?: boolean;
  isActive?: boolean;
  createdAt?: string;
  bio?: string | null;
  department?: Department | null;
  academicYear?: AcademicYear | null;
  specialization?: Specialization | null;
  points?: number;
  streakCount?: number;
  /** Stockpiled streak freezes -- each covers one missed day. One granted per active week. */
  streakFreezes?: number;
  badges?: string[];
  referredBy?: string | null;
  referralCount?: number;
  isOnline?: boolean;
  lastSeenAt?: string | null;
  blockedUsers?: string[];
  friends?: string[];
  friendRequestsSent?: string[];
  friendRequestsReceived?: string[];
  // AI assistant personalisation: the name the student gave the assistant, and the name the
  // assistant should call the student by. Set from the assistant's first-run card / settings.
  aiAssistantName?: string | null;
  aiPreferredName?: string | null;
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

export interface LectureFlashcard {
  front: string;
  back: string;
}

export interface LectureQuizItem {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface LectureGlossaryEntry {
  term: string;
  definition: string;
}

// AI-generated study aids for one lecture PDF -- see the backend's LectureStudyToolsService.
// Generated once on demand, then cached + shared for everyone who opens that lecture.
export interface LectureStudyKit {
  _id: string;
  post: string;
  courseCode: string | null;
  overview: string;
  keyPoints: string[];
  glossary: LectureGlossaryEntry[];
  flashcards: LectureFlashcard[];
  quiz: LectureQuizItem[];
  model: string;
  createdAt: string;
  updatedAt: string;
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

// GET /api/admin/stats/trends?range=7|14|30|90 -- a daily series + this-period-vs-last-period
// totals per metric, for the console dashboard's KPI deltas + sparklines. Additive, separate
// from AdminStats (which stays range-fixed).
export interface AdminTrendSeries {
  series: DailyCount[];
  current: number;
  previous: number;
}

export interface AdminTrends {
  range: number;
  signups: AdminTrendSeries;
  posts: AdminTrendSeries;
  comments: AdminTrendSeries;
  quizAttempts: AdminTrendSeries;
  chatMessages: AdminTrendSeries;
  aiMessages: AdminTrendSeries;
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
  /** User ids who tapped 👍. Client derives likeCount + "did I like" from this. */
  likes?: string[];
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
  // 'public' groups are visible to every user and anyone can join by opening them.
  visibility?: 'private' | 'public';
  name?: string | null;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  updatedAt?: string;
  createdBy?: string | null;
  groupIcon?: string | null;
  groupDescription?: string | null;
  admins?: string[];
  // Public groups only: users an admin removed (blocked from re-joining).
  blockedUsers?: string[];
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
  attachmentUrl?: string | null;
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
  /** Client-only: an optimistic message shown before the server has echoed it back. */
  pending?: boolean;
  /** Client-only: an optimistic message the server never acknowledged (tap to retry). */
  failed?: boolean;
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
  photoUrl?: string | null;
  owner: string;
  members: string[];
  visibility: GroupVisibility;
  inviteCode: string | null;
  createdAt: string;
  updatedAt?: string;
}

// One row in the unified "المجموعات" explorer (GET /groups/all) -- every group in the app,
// annotated with the caller's relationship to it. No inviteCode / member id list.
export interface GroupListItem {
  _id: string;
  name: string;
  description: string | null;
  photoUrl: string | null;
  owner: string;
  visibility: GroupVisibility;
  memberCount: number;
  isMember: boolean;
  isOwner: boolean;
  createdAt: string;
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
  /** @deprecated legacy single-attachment field; use `attachments` */
  attachmentUrl?: string | null;
  attachments?: Attachment[];
  replyTo?: ReplyPreview | null;
  reactions?: MessageReaction[];
  edited?: boolean;
  editedAt?: string | null;
  deletedForEveryone?: boolean;
  forwarded?: boolean;
  starredBy?: string[];
  mentions?: string[];
  createdAt: string;
  /** Client-only: an optimistic message shown before the server has echoed it back. */
  pending?: boolean;
  /** Client-only: an optimistic message the server never acknowledged (tap to retry). */
  failed?: boolean;
}

export interface GroupMembers {
  owner: string;
  members: User[];
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
  | 'friend_accept'
  // Academia Reels -- all link to /reels/<reelId>.
  | 'reel_like'
  | 'reel_comment'
  | 'reel_comment_reply'
  | 'reel_mention'
  // Someone commented on your anonymous الجدار post -- links to /wall.
  | 'wall_comment'
  // An event you RSVP'd to starts soon -- links to /events; `preview` is the event title.
  | 'event_reminder'
  // Platform/department announcement broadcast -- `actor` is the announcement's author,
  // `title` the headline. Legacy rows predating the author carry a null actor.
  | 'system_announcement';

export interface Notification {
  _id: string;
  recipient: string;
  // null when the actor's account has since been deleted, or for legacy actor-less system broadcasts.
  actor: User | null;
  type: NotificationType;
  conversationId?: string | null;
  channelId?: string | null;
  groupId?: string | null;
  postId?: string | null;
  reelId?: string | null;
  questionId?: string | null;
  preview?: string | null;
  // Set for system_announcement: the announcement headline / explicit click target.
  title?: string | null;
  link?: string | null;
  read: boolean;
  createdAt: string;
}

// --- Academia Reels (اكاديميا) ---

export interface ReelAuthor {
  id: string;
  name: string;
  photoUrl: string | null;
  role: Role;
  collegeId: string | null;
}

export interface Reel {
  id: string;
  author: ReelAuthor | null;
  // 'stream' -> videoUrl is an HLS manifest (.m3u8); play via lib/hls attachHls(). 'cloudinary'
  // (default for every pre-Stream reel) -> a plain video URL.
  videoProvider: 'cloudinary' | 'stream';
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  durationSec: number;
  hashtags: string[];
  department: Department | null;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  createdAt: string;
}

export interface ReelFeedPage {
  data: Reel[];
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ReelComment {
  id: string;
  author: ReelAuthor | null;
  text: string;
  edited: boolean;
  parent: string | null;
  replyCount: number;
  likeCount: number;
  likedByMe: boolean;
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

// GET /ai/usage -- today's assistant message quota for the signed-in student. Resets at
// `resetsAt` (next local midnight). `remaining` is clamped at 0.
export interface AiUsage {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
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

// --- File converter / محوّل الملفات (src/convert) -- PDF / Word / PowerPoint / Excel only ---

export type ConvertExt = 'pdf' | 'docx' | 'pptx' | 'xlsx';

export interface ConvertFormatMeta {
  ext: ConvertExt;
  label: string; // "PDF" | "Word" | "PowerPoint" | "Excel"
}

export interface ConvertCapabilities {
  maxSizeMb: number;
  historyTtlHours: number;
  maxParallel: number;
  targets: ConvertExt[];
  // source extension -> list of extensions it can be converted to
  matrix: Record<string, ConvertExt[]>;
  formats: ConvertFormatMeta[];
}

export type ConversionStatus = 'queued' | 'processing' | 'done' | 'failed';

// A conversion job (POST /convert returns these; GET /convert/jobs + /history poll them).
export interface ConversionRecord {
  id: string;
  sourceName: string;
  sourceFormat: string;
  targetFormat: string;
  filename: string;
  status: ConversionStatus;
  progress: number; // 0-100
  stage: string;
  cached: boolean;
  sizeBytes: number;
  error: string | null;
  createdAt: string;
  expiresAt: string;
}

// --- السوق (student marketplace) -- شعبة-scoped listings (src/marketplace) ---

export type ListingCategory = 'books' | 'electronics' | 'notes' | 'supplies' | 'other';
export type ListingStatus = 'available' | 'reserved' | 'sold';

export interface MarketplaceListing {
  _id: string;
  title: string;
  description: string;
  price: number;
  category: ListingCategory;
  status: ListingStatus;
  department: Department | null;
  mine: boolean;
  seller: { _id: string; name: string; photoUrl: string | null } | null;
  createdAt: string;
}

// --- غرف المذاكرة (study-together rooms) -- شعبة-scoped, shared Pomodoro (src/rooms) ---

export interface RoomMemberLite {
  _id: string;
  name: string;
  photoUrl: string | null;
}

export interface RoomTimerState {
  phase: 'focus' | 'break';
  running: boolean;
  endsAt: string | null;
  remainingMs: number | null;
  focusMin: number;
  breakMin: number;
}

export interface StudyRoomListItem {
  _id: string;
  name: string;
  topic: string;
  department: Department | null;
  memberCount: number;
  members: RoomMemberLite[];
  timerPhase: 'focus' | 'break';
  timerRunning: boolean;
  mine: boolean;
  joined: boolean;
  createdAt: string;
  /** null = live now; a future ISO date = an upcoming scheduled session. */
  scheduledFor: string | null;
}

export interface StudyRoomDetail extends StudyRoomListItem {
  timer: RoomTimerState;
}

// --- الفعاليات (campus events & clubs) -- شعبة-scoped, RSVP (src/events) ---

export interface CampusEvent {
  _id: string;
  title: string;
  description: string;
  location: string;
  organizer: string;
  startsAt: string;
  endsAt: string | null;
  department: Department | null;
  capacity: number | null;
  attendeeCount: number;
  going: boolean;
  mine: boolean;
  full: boolean;
  createdBy: { _id: string; name: string; photoUrl: string | null; role: string } | null;
  createdAt: string;
}

// --- الجدار (campus wall) -- anonymous, AI-moderated, شعبة-scoped (src/wall) ---

export interface WallPost {
  _id: string;
  // Stable one-way pseudonym -- same author always maps to the same hash, never reversible.
  authorHash: string;
  department: Department | null;
  body: string;
  likeCount: number;
  liked: boolean;
  commentCount: number;
  // True when the signed-in user is this post's (anonymous) author.
  mine: boolean;
  createdAt: string;
}

export interface WallComment {
  _id: string;
  authorHash: string;
  body: string;
  mine: boolean;
  createdAt: string;
}
