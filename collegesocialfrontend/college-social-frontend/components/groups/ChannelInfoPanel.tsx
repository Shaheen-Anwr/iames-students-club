'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Crown, FileText, Globe, Link2, LogOut, PlayCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { RoleBadge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { Lightbox } from '@/components/ui/Lightbox';
import { LinkPreviewCard } from '@/components/chat/LinkPreviewCard';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useGroups } from '@/lib/groups-context';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn, formatBytes, timeAgo } from '@/lib/utils';
import type { GroupMembers, SharedMedia } from '@/lib/types';

const TABS = [
  { id: 'members', label: 'الأعضاء' },
  { id: 'media', label: 'الوسائط' },
  { id: 'files', label: 'الملفات' },
  { id: 'links', label: 'الروابط' },
];

export function ChannelInfoPanel({
  open,
  onClose,
  groupId,
  channelId,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  channelId: string;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const { findGroup, refresh } = useGroups();
  const { showToast } = useToast();
  const group = findGroup(groupId);

  const [tab, setTab] = useState('members');
  const [members, setMembers] = useState<GroupMembers | null>(null);
  const [media, setMedia] = useState<SharedMedia | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      api.get<GroupMembers>(`/groups/${groupId}/members`),
      api.get<SharedMedia>(`/groups/channels/${channelId}/media`),
    ])
      .then(([m, sm]) => {
        setMembers(m);
        setMedia(sm);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [open, groupId, channelId]);

  function copyInviteCode() {
    if (!group?.inviteCode) return;
    navigator.clipboard.writeText(group.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleLeave() {
    if (!confirm('هل تريد مغادرة هذه المجموعة؟')) return;
    setLeaving(true);
    try {
      await api.post(`/groups/${groupId}/leave`);
      await refresh();
      router.push('/groups');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر مغادرة المجموعة', 'error');
      setLeaving(false);
    }
  }

  const images = (media?.media ?? []).filter((m) => m.type === 'image').map((m) => assetUrl(m.url)!);

  return (
    <>
      <Modal open={open} onClose={onClose} title="معلومات المجموعة" className="max-w-lg">
        {group && (
          <div className="mb-4 flex flex-col items-center gap-2 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-accent text-2xl font-semibold text-white">
              {group.name.trim().slice(0, 1)}
            </div>
            <p className="text-base font-semibold text-foreground">{group.name}</p>
            {group.description && <p className="text-sm text-muted-foreground">{group.description}</p>}
            {group.visibility === 'private' && group.inviteCode ? (
              <button
                onClick={copyInviteCode}
                className="mt-1 flex items-center gap-2 rounded-xl2 bg-surface-2/70 px-3.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <span className="font-mono tracking-widest">{group.inviteCode}</span>
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <div className="mt-1 flex items-center gap-1.5 rounded-xl2 bg-surface-2/70 px-3.5 py-2 text-xs text-muted-foreground">
                <Globe className="h-3.5 w-3.5" />
                مجموعة عامة
              </div>
            )}
          </div>
        )}

        <div className="-mx-5">
          <Tabs tabs={TABS} active={tab} onChange={setTab} className="px-5" />
        </div>

        <div className="pt-4">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner className="h-6 w-6" />
            </div>
          ) : tab === 'members' ? (
            <div className="space-y-1">
              {(members?.members ?? []).map((m) => (
                <div key={m._id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                  <Avatar src={assetUrl(m.photoUrl)} name={m.name} size="sm" viewable />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {m.name}
                      {m._id === user?._id && <span className="text-muted-foreground"> (أنت)</span>}
                    </p>
                  </div>
                  {members?.owner === m._id && (
                    <span className="flex items-center gap-1 text-xs font-medium text-amber-500">
                      <Crown className="h-3.5 w-3.5" /> المالك
                    </span>
                  )}
                  <RoleBadge role={m.role} />
                </div>
              ))}
            </div>
          ) : tab === 'media' ? (
            (media?.media.length ?? 0) === 0 ? (
              <EmptyState label="لا توجد وسائط بعد" />
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {media!.media.map((item, i) => {
                  const url = assetUrl(item.url)!;
                  if (item.type === 'video') {
                    return (
                      <a
                        key={`${item._id}-${i}`}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative flex aspect-square items-center justify-center rounded-lg bg-surface-2 text-muted-foreground"
                      >
                        <video src={url} className="h-full w-full rounded-lg object-cover opacity-70" />
                        <PlayCircle className="absolute h-7 w-7 text-white drop-shadow" />
                      </a>
                    );
                  }
                  const imgIndex = images.indexOf(url);
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${item._id}-${i}`}
                      src={url}
                      alt=""
                      onClick={() => imgIndex >= 0 && setLightboxIndex(imgIndex)}
                      className="aspect-square cursor-pointer rounded-lg object-cover transition-opacity hover:opacity-90"
                    />
                  );
                })}
              </div>
            )
          ) : tab === 'files' ? (
            (media?.files.length ?? 0) === 0 ? (
              <EmptyState label="لا توجد ملفات بعد" />
            ) : (
              <div className="space-y-1.5">
                {media!.files.map((file, i) => (
                  <a
                    key={`${file._id}-${i}`}
                    href={assetUrl(file.url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-xl2 bg-surface-2/60 px-3 py-2.5 hover:bg-surface-2"
                  >
                    <FileText className="h-5 w-5 shrink-0 text-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{file.name ?? 'مرفق'}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.size != null ? formatBytes(file.size) : ''} · {timeAgo(file.createdAt)}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            )
          ) : (media?.links.length ?? 0) === 0 ? (
            <EmptyState label="لا توجد روابط بعد" />
          ) : (
            <div className="space-y-2">
              {media!.links.map((link, i) => (
                <LinkPreviewCard key={`${link.messageId}-${i}`} url={link.url} isOwn={false} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLeave}
            loading={leaving}
            className="w-full justify-start text-danger hover:bg-danger/10"
          >
            <LogOut className="h-4 w-4" />
            مغادرة المجموعة
          </Button>
        </div>
      </Modal>

      {lightboxIndex !== null && (
        <Lightbox images={images} index={lightboxIndex} onIndexChange={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Link2 className={cn('h-6 w-6 text-muted-foreground')} />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
