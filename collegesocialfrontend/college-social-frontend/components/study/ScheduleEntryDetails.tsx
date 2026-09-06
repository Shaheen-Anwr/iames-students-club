import { Calendar, Clock, MapPin } from 'lucide-react';
import type { ScheduleEntry } from '@/lib/types';
import { WEEK_DAYS } from '@/lib/schedule-week';

// Read-only view opened when a student/professor taps an entry (admins get the edit form instead
// -- see ScheduleGrid.tsx) -- surfaces the photo/description an admin or professor may have
// attached when publishing this entry (the same content that was auto-posted to the feed).
export function ScheduleEntryDetails({ entry }: { entry: ScheduleEntry }) {
  const dayLabel = WEEK_DAYS.find((d) => d.value === entry.dayOfWeek)?.label ?? '';

  return (
    <div className="space-y-4">
      {entry.photoUrl && (
        <div className="overflow-hidden rounded-xl2 bg-surface-2">
          <img src={entry.photoUrl} alt={entry.courseName} className="max-h-72 w-full object-cover" />
        </div>
      )}

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
          {dayLabel}
        </div>
        <div className="flex items-center gap-2 text-foreground">
          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
          {entry.startTime} - {entry.endTime}
        </div>
        {entry.location && (
          <div className="flex items-center gap-2 text-foreground">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            {entry.location}
          </div>
        )}
      </div>

      {entry.description && (
        <p className="whitespace-pre-wrap rounded-xl2 bg-surface-2/60 p-3 text-sm text-foreground">{entry.description}</p>
      )}
    </div>
  );
}
