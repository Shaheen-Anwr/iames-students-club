'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { CourseSummary } from '@/lib/types';

const MAX_CHIPS = 8;

const CHIP = 'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors';
const CHIP_ACTIVE = 'bg-accent text-white shadow-glow';
const CHIP_INACTIVE = 'bg-surface-2 text-muted-foreground hover:bg-surface-2/70 hover:text-foreground';

// Toolbar row: lets a student jump straight to their course's posts. Backed by the previously
// unused GET /posts/courses aggregation (active courses by latest attachment activity).
export function CourseChips({ value, onChange }: { value: string | null; onChange: (courseCode: string | null) => void }) {
  const [courses, setCourses] = useState<CourseSummary[]>([]);

  useEffect(() => {
    api
      .get<CourseSummary[]>('/posts/courses')
      .then(setCourses)
      .catch(() => {});
  }, []);

  if (courses.length === 0) return null;

  const top = courses.slice(0, MAX_CHIPS);

  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-thin">
      <button type="button" onClick={() => onChange(null)} className={cn(CHIP, value === null ? CHIP_ACTIVE : CHIP_INACTIVE)}>
        الكل
      </button>
      {top.map((course) => (
        <button
          key={course.courseCode}
          type="button"
          onClick={() => onChange(course.courseCode)}
          className={cn(CHIP, value === course.courseCode ? CHIP_ACTIVE : CHIP_INACTIVE)}
        >
          {course.courseCode}
        </button>
      ))}
    </div>
  );
}
