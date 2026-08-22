// Fixed, code-defined badge catalog -- not DB-managed content, mirrors how ReactionType/
// PostAttachmentType are defined as enums rather than collections.
export const BADGES = {
  first_post: { label: 'أول منشور', description: 'شاركت أول منشور لك', icon: '📝' },
  active_streak_7: { label: 'مثابر', description: 'نشط لمدة 7 أيام متتالية', icon: '🔥' },
  helpful_10: { label: 'متفاعل', description: 'حصل منشورك على 10 تفاعلات', icon: '🤝' },
  assignments_5: { label: 'مجتهد', description: 'أكملت 5 واجبات', icon: '🎯' },
  quizzes_5: { label: 'عبقري الاختبارات', description: 'حللت 5 اختبارات', icon: '🧠' },
} as const;

export type BadgeId = keyof typeof BADGES;

export const POINTS = {
  POST_CREATED: 10,
  REACTION_GIVEN: 1,
  COMMENT_ADDED: 3,
  REPLY_ADDED: 2,
  ASSIGNMENT_COMPLETED: 15,
  QUIZ_ATTEMPTED: 5,
  DAILY_LOGIN: 2,
} as const;
