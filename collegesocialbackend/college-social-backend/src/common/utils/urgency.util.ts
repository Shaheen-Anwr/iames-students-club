export type Urgency = 'overdue' | 'urgent' | 'normal' | 'completed';

// Same day-difference threshold as the frontend's AssignmentCard.urgencyOf/PlannerList.taskUrgency
// (urgent = due within 2 calendar days) -- kept here so the dashboard aggregation classifies
// due-today/due-soon items identically to how the study pages render them.
export function urgencyOf(dueDate: Date | null, done: boolean): Urgency {
  if (done) return 'completed';
  if (!dueDate) return 'normal';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) return 'overdue';
  if (diffDays <= 2) return 'urgent';
  return 'normal';
}
