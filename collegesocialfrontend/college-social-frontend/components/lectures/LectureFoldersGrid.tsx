'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, FileText, Folder, Plus, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { cn, timeAgo } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { LectureFolder, PostAttachmentType } from '@/lib/types';
import { CreateFolderModal } from './CreateFolderModal';

const PALETTE = [
  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
];

function folderColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function LectureFoldersGrid({
  attachmentType,
  basePath,
  title,
  emptyLabel,
}: {
  attachmentType: Extract<PostAttachmentType, 'lecture' | 'video'>;
  basePath: string;
  title: string;
  emptyLabel: string;
}) {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'professor';
  const [folders, setFolders] = useState<LectureFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get<LectureFolder[]>(`/posts/lectures/folders?type=${attachmentType}`)
      .then(setFolders)
      .finally(() => setLoading(false));
  }, [attachmentType]);

  function handleCreated(folder: LectureFolder) {
    setFolders((prev) => [folder, ...prev]);
  }

  const Icon = attachmentType === 'lecture' ? FileText : Video;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Icon className="h-5 w-5 text-accent" />
          {title}
        </h1>
        {canManage && (
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            مجلد جديد
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : folders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <Folder className="h-8 w-8" />
          <p className="text-sm">{emptyLabel}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <Link key={folder.name} href={`${basePath}/${encodeURIComponent(folder.name)}`} className="group">
              <Card className="flex items-center gap-3 p-5 transition-shadow hover:shadow-card">
                <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', folderColor(folder.name))}>
                  <Folder className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{folder.name}</p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{folder.lectureCount} محاضرة</span>
                    {folder.lectureCount > 0 && (
                      <>
                        <span>·</span>
                        <span>آخر تحديث {timeAgo(folder.latestAt)}</span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1" />
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CreateFolderModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleCreated} attachmentType={attachmentType} />
    </div>
  );
}
