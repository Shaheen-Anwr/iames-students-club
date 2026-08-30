'use client';

import { useParams } from 'next/navigation';
import { RoomView } from '@/components/rooms/RoomView';

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  return <RoomView roomId={id} />;
}
