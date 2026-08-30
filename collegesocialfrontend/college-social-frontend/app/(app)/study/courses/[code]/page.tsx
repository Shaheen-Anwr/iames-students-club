'use client';

import { useParams } from 'next/navigation';
import { CourseHubDetail } from '@/components/study/CourseHubDetail';

export default function StudyCoursePage() {
  const { code } = useParams<{ code: string }>();
  return <CourseHubDetail courseCode={decodeURIComponent(code)} />;
}
