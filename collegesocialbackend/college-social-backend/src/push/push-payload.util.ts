import { AnnouncementDocument } from '../announcements/schemas/announcement.schema';
import { NotificationDocument, NotificationType } from '../notifications/schemas/notification.schema';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  icon: string;
  tag: string;
}

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
  friend_request: 'أرسل لك طلب صداقة',
  friend_accept: 'قبل طلب صداقتك',
  reel_like: 'أعجب بالريل الخاص بك',
  reel_comment: 'علّق على الريل الخاص بك',
  reel_comment_reply: 'رد على تعليقك',
  reel_mention: 'أشار إليك في ريل',
  // Never used to build a title -- system_announcement pushes go through
  // buildAnnouncementPushPayload(), which uses the announcement's own title. Present only so
  // this map stays exhaustive over NotificationType.
  system_announcement: '',
};

// Mirrors notificationHref() in the frontend's NotificationBell.tsx, but returns an absolute
// path (joined with frontendUrl by the caller) since a service worker can't run app routing code.
function relativeHref(notification: NotificationDocument): string {
  switch (notification.type) {
    case 'chat_message':
      return notification.conversationId ? `/chat/${notification.conversationId}` : '/chat';
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
    case 'post_comment':
    case 'post_reaction':
    case 'post_share':
    case 'comment_reply':
    case 'comment_reaction':
    case 'mention':
    default:
      return '/feed';
  }
}

export function buildPushPayload(notification: NotificationDocument, frontendUrl: string): PushPayload {
  const actorName = (notification.actor as { name?: string } | null)?.name ?? 'شخص ما';
  return {
    title: `${actorName} ${LABELS[notification.type]}`,
    body: notification.preview ?? '',
    url: `${frontendUrl}${relativeHref(notification)}`,
    icon: `${frontendUrl}/icons/icon-192.png`,
    tag: notification.type,
  };
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
