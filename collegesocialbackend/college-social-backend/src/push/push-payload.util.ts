import { AnnouncementDocument } from '../announcements/schemas/announcement.schema';
import { NotificationDocument, NotificationType } from '../notifications/schemas/notification.schema';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  icon: string;
  /** Same tag = one notification that updates in place (the SW re-alerts on every update). */
  tag: string;
  /** Chat pushes only: the SW skips the system notification while the user has the app open in
   *  front of them -- the page plays its own sound and in-app banner instead. */
  conversationId?: string;
  /** Delivery hints for the push service (see PushService.requestOptions). 'high' wakes a dozing
   *  Android phone right away instead of batching the push for its next maintenance window. */
  urgency?: 'normal' | 'high';
  /** Seconds the push service keeps trying an offline device before dropping the push. */
  ttl?: number;
}

const DAY_SECONDS = 24 * 60 * 60;

// Arabic label per notification type, shown as the push title's action phrase (prefixed with the
// actor's name). Mirrors NOTIFICATION_LABELS in the frontend's NotificationBell.tsx -- kept in
// sync manually since a push payload is built server-side and can't import frontend code.
const LABELS: Record<NotificationType, string> = {
  chat_message: 'أرسل لك رسالة',
  channel_message: 'أرسل رسالة في المجموعة',
  post_comment: 'علّق على منشورك',
  post_reaction: 'تفاعل مع منشورك',
  post_share: 'شارك منشورك',
  comment_reply: 'رد على تعليقك',
  comment_reaction: 'تفاعل مع تعليقك',
  qa_answer: 'أجاب على سؤالك',
  mention: 'أشار إليك',
  friend_request: 'أرسل لك طلب صحبة',
  friend_accept: 'قبل طلب صحبتك',
  reel_like: 'أعجب بالريل الخاص بك',
  reel_comment: 'علّق على الريل الخاص بك',
  reel_comment_reply: 'رد على تعليقك',
  reel_mention: 'أشار إليك في ريل',
  wall_comment: 'علّق على منشورك في الجدار',
  event_reminder: 'فعالية قريبة',
  // Never used to build a title -- system_announcement pushes go through
  // buildAnnouncementPushPayload(), which uses the announcement's own title. Present only so
  // this map stays exhaustive over NotificationType.
  system_announcement: '',
  // A reminder the user set for themself -- the title is just this phrase (see buildPushPayload).
  chat_reminder: 'تذكير برسالة',
  thread_reply: 'ردّ في سلسلة',
};

// Mirrors notificationHref() in the frontend's NotificationBell.tsx, but returns an absolute
// path (joined with frontendUrl by the caller) since a service worker can't run app routing code.
function relativeHref(notification: NotificationDocument): string {
  if (notification.link) return notification.link;
  switch (notification.type) {
    case 'chat_message':
      return notification.conversationId ? `/chat/${notification.conversationId}` : '/chat';
    // An @mention inside a chat lands in that chat; any other mention keeps the feed fallback.
    case 'mention':
      return notification.conversationId ? `/chat/${notification.conversationId}` : '/feed';
    case 'channel_message':
      return notification.groupId && notification.channelId
        ? `/groups/${notification.groupId}/${notification.channelId}`
        : '/groups';
    case 'qa_answer':
      return notification.questionId ? `/study/qa/${notification.questionId}` : '/study/qa';
    case 'friend_request':
    case 'friend_accept': {
      const actorId = (notification.actor as { _id?: { toString(): string } } | null)?._id;
      return actorId ? `/profile/${actorId.toString()}` : '/profile';
    }
    case 'reel_like':
    case 'reel_comment':
    case 'reel_comment_reply':
    case 'reel_mention':
      return notification.reelId ? `/reels/${notification.reelId}` : '/reels';
    case 'wall_comment':
      return '/wall';
    case 'event_reminder':
      return '/events';
    case 'post_comment':
    case 'post_reaction':
    case 'post_share':
    case 'comment_reply':
    case 'comment_reaction':
    default:
      return '/feed';
  }
}

export function buildPushPayload(notification: NotificationDocument, frontendUrl: string): PushPayload {
  const actorName = (notification.actor as { name?: string } | null)?.name ?? 'شخص ما';
  const payload: PushPayload = {
    title: notification.type === 'chat_reminder' ? `⏰ ${LABELS.chat_reminder}` : `${actorName} ${LABELS[notification.type]}`,
    body: notification.preview ?? '',
    url: `${frontendUrl}${relativeHref(notification)}`,
    icon: `${frontendUrl}/icons/icon-192.png`,
    tag: notification.type,
  };

  // Messages: one notification per conversation/channel (WhatsApp-style), delivered urgently.
  // A single shared 'chat_message' tag used to fold every chat into one silent notification.
  const conversationId = notification.conversationId?.toString();
  if ((notification.type === 'chat_message' || notification.type === 'mention') && conversationId) {
    return { ...payload, tag: `chat-${conversationId}`, conversationId, urgency: 'high', ttl: DAY_SECONDS };
  }
  if (notification.type === 'channel_message') {
    const channelId = notification.channelId?.toString();
    return { ...payload, tag: channelId ? `channel-${channelId}` : payload.tag, urgency: 'high', ttl: DAY_SECONDS };
  }
  if (notification.type === 'chat_reminder' || notification.type === 'thread_reply') {
    return { ...payload, urgency: 'high', ttl: DAY_SECONDS };
  }
  return payload;
}

// Push payload for a platform/department announcement broadcast. Leads with the announcer's name
// when known ("📢 <name>: <title>") so the recipient sees who posted it, then the body excerpt;
// always lands on the announcements page. `tag` is per-announcement so a device that somehow
// receives it twice collapses to one notification.
export function buildAnnouncementPushPayload(
  announcement: AnnouncementDocument,
  frontendUrl: string,
  authorName?: string | null,
): PushPayload {
  const body = announcement.body.length > 140 ? `${announcement.body.slice(0, 139)}…` : announcement.body;
  return {
    title: authorName ? `📢 ${authorName}: ${announcement.title}` : `📢 ${announcement.title}`,
    body,
    url: `${frontendUrl}/announcements`,
    icon: `${frontendUrl}/icons/icon-192.png`,
    tag: `announcement-${announcement._id.toString()}`,
  };
}
