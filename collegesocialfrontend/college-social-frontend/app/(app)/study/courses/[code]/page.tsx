'use client';

import { useParams } from 'next/navigation';
import { CoursePostsList } from '@/components/study/CoursePostsList';

export default function StudyCoursePage() {
  const { code } = useParams<{ code: string }>();
  return <CoursePostsList courseCode={decodeURIComponent(code)} />;
}
