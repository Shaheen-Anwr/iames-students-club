'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  BellOff,
  Camera,
  Crown,
  Image as ImageIcon,
  LogOut,
  Pencil,
  Pin,
  Search,
  ShieldOff,
  Timer,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { RoleBadge } from '@/components/ui/Badge';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { isArchived, isGroupAdmin, isMuted, isPinned, otherParticipants, presenceLabel } from '@/lib/chat-helpers';
import { assetUrl, cn } from '@/lib/utils';
import type { Conversation, User } from '@/lib/types';
import { SharedMediaPanel } from './SharedMediaPanel';

const DISAPPEARING_OPTIONS = [
  { label: 'إيقاف', seconds: 0 },
  { label: '24 ساعة', seconds: 24 * 3600 },
  { label: '7 أيام', seconds: 7 * 24 * 3600 },
  { label: '90 يومًا', seconds: 90 * 24 * 3600 },
];

interface GroupInfoPanelProps {
  open: boolean;
  onClose: () => void;
  conversation: Conversation;
  onChanged: () => void;
}

export function GroupInfoPanel({ open, onClose, conversation, onChanged }: GroupInfoPanelProps) {
  const { user, updateLocalUser } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const isAdmin = user ? isGroupAdmin(conversation, user._id) : false;

  const [nameDraft, setNameDraft] = useState(conversation.name ?? '');
  const [descDraft, setDescDraft] = useState(conversation.groupDescription ?? '');
  const [editingInfo, setEditingInfo] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);

  useEffect(() => {
    setNameDraft(conversation.name ?? '');
    setDescDraft(conversation.groupDescription ?? '');
  }, [conversation]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let isMounted = true;
    const handle = setTimeout(async () => {
      try {
        const rawUsers = await api.get<User[] | { data: User[] }>(`/users/search?q=${encodeURIComponent(query.trim())}`);
        const users = Array.isArray(rawUsers) ? rawUsers : (rawUsers as { data: User[] })?.data ?? [];
        if (isMounted) {
          const participantIds = new Set((conversation.participants || []).map((p) => p?._id).filter(Boolean));
          setResults((Array.isArray(users) ? users : []).filter((u) => u && u._id && !participantIds.has(u._id)));
        }
      } catch (err) {
        if (isMounted) setResults([]);
      }
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(handle);
    };
  }, [query, conversation.participants]);

  if (!user) return null;

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (err: any) {
      console.error('Chat Action Error:', err);
      let message = 'تعذّر تنفيذ الإجراء.';

      if (err instanceof ApiError && err.message) {
        message = Array.isArray(err.message) ? err.message.join(' | ') : String(err.message);
      } else if (err?.response?.data?.message) {
        const msg = err.response.data.message;
        message = Array.isArray(msg) ? msg.join(' | ') : String(msg);
      } else if (typeof err?.message === 'string') {
        message = err.message;
      }

      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveInfo() {
    await run(() =>
      api.patch(`/chat/conversations/${conversation._id}`, {
        name: nameDraft.trim(),
        groupDescription: descDraft.trim(),
      }),
    );
    setEditingInfo(false);
  }

  async function uploadIcon(file: File) {
    await run(async () => {
      const rawUploaded = await api.upload<any>('/upload/file', file);
      const data = rawUploaded?.data ?? rawUploaded;
      const iconUrl = data?.url || data?.secure_url || data?.fileUrl || data?.path || data?.location;

      if (!iconUrl) {
        throw new Error('فشل رفع الصورة: لم يتم استلام رابط من السيرفر.');
      }

      await api.patch(`/chat/conversations/${conversation._id}`, { groupIcon: iconUrl });
    });
  }

  async function addMember(userId: string) {
    await run(() => api.post(`/chat/conversations/${conversation._id}/members`, { userIds: [userId] }));
    setQuery('');
    setResults([]);
  }

  async function removeMember(userId: string) {
    await run(() => api.delete(`/chat/conversations/${conversation._id}/members/${userId}`));
  }

  async function toggleAdmin(userId: string, makeAdmin: boolean) {
    await run(() =>
      makeAdmin
        ? api.post(`/chat/conversations/${conversation._id}/admins/${userId}`)
        : api.delete(`/chat/conversations/${conversation._id}/admins/${userId}`),
    );
  }

  async function leaveGroup() {
    if (!confirm('هل تريد مغادرة هذه المجموعة؟')) return;
    await run(() => api.post(`/chat/conversations/${conversation._id}/leave`));
    onClose();
    router.push('/chat');
  }

  async function clearChat() {
    if (!confirm('سيتم حذف كل الرسائل من عندك فقط. هل تريد المتابعة؟')) return;
    await run(() => api.delete(`/chat/conversations/${conversation._id}/messages`));
  }

  async function deleteConversation() {
    if (!confirm('ستختفي هذه المحادثة من قائمتك. هل تريد المتابعة؟')) return;
    await run(() => api.delete(`/chat/conversations/${conversation._id}`));
    onClose();
    router.push('/chat');
  }

  async function toggleBlock() {
    if (!others[0]) return;
    const targetId = others[0]._id;
    if (!blocked && !confirm('لن يتمكن هذا المستخدم من مراسلتك بعد الحظر. هل تريد المتابعة؟')) return;
    await run(async () => {
      const rawUpdated = blocked
        ? await api.delete<User | { data: User }>(`/users/${targetId}/block`)
        : await api.post<User | { data: User }>(`/users/${targetId}/block`);
      const updatedUser = (rawUpdated as { data?: User })?.data ?? (rawUpdated as User);
      if (updatedUser) updateLocalUser(updatedUser);
    });
  }

  async function setDisappearing(seconds: number) {
    await run(() =>
      api.patch(`/chat/conversations/${conversation._id}`, {
        disappearingSeconds: Number(seconds),
      }),
    );
  }

  const others = otherParticipants(conversation, user._id) || [];
  const targetUser = others[0];
  const title = conversation.isGroup ? conversation.name ?? 'محادثة جماعية' : targetUser?.name ?? 'مستخدم غير معروف';
  const avatarUrl = conversation.isGroup ? conversation.groupIcon : targetUser?.photoUrl;
  const pinned = isPinned(conversation, user._id);
  const archived = isArchived(conversation, user._id);
  const muted = isMuted(conversation, user._id);
  const blocked = !conversation.isGroup && !!targetUser && Array.isArray(user.blockedUsers) && user.blockedUsers.includes(targetUser._id);

  return (
    <Modal open={open} onClose={onClose} title={conversation.isGroup ? 'معلومات المجموعة' : 'معلومات جهة الاتصال'} className="max-w-lg">
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 pb-2">
          <div className="relative">
            <Avatar src={assetUrl(avatarUrl)} name={title} size="xl" />
            {conversation.isGroup && isAdmin && (
              <label className="absolute bottom-0 end-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-accent text-white shadow-soft">
                <Camera className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadIcon(e.target.files[0])}
                />
              </label>
            )}
          </div>

          {conversation.isGroup && editingInfo ? (
            <div className="w-full space-y-2">
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="اسم المجموعة" />
              <Input value={descDraft} onChange={(e) => setDescDraft(e.target.value)} placeholder="وصف المجموعة" />
              <div className="flex justify-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditingInfo(false)}>
                  إلغاء
                </Button>
                <Button size="sm" onClick={saveInfo} loading={busy}>
                  حفظ
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">{title}</p>
              {conversation.isGroup ? (
                <p className="mt-1 text-sm text-muted-foreground">{conversation.groupDescription || 'لا يوجد وصف'}</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">{targetUser ? `الرقم الجامعي ${targetUser.collegeId ?? ''}` : ''}</p>
                  <p className="mt-1 text-xs text-accent">{presenceLabel(targetUser)}</p>
                </>
              )}
              {conversation.isGroup && isAdmin && (
                <button
                  onClick={() => setEditingInfo(true)}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  <Pencil className="h-3 w-3" /> تعديل
                </button>
              )}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <button
            disabled={busy}
            onClick={() => run(() => api.post(`/chat/conversations/${conversation._id}/pin`))}
            className={cn('flex flex-col items-center gap-1.5 rounded-xl2 p-3 text-xs disabled:opacity-50', pinned ? 'bg-accent/10 text-accent' : 'bg-surface-2/70 text-foreground')}
          >
            <Pin className="h-4 w-4" /> {pinned ? 'إلغاء التثبيت' : 'تثبيت'}
          </button>
          <button
            disabled={busy}
            onClick={() =>
              run(() =>
                muted
                  ? api.delete(`/chat/conversations/${conversation._id}/mute`)
                  : api.post(`/chat/conversations/${conversation._id}/mute`, {}),
              )
            }
            className={cn('flex flex-col items-center gap-1.5 rounded-xl2 p-3 text-xs disabled:opacity-50', muted ? 'bg-accent/10 text-accent' : 'bg-surface-2/70 text-foreground')}
          >
            <BellOff className="h-4 w-4" /> {muted ? 'إلغاء الكتم' : 'كتم'}
          </button>
          <button
            disabled={busy}
            onClick={() => run(() => api.post(`/chat/conversations/${conversation._id}/archive`))}
            className={cn('flex flex-col items-center gap-1.5 rounded-xl2 p-3 text-xs disabled:opacity-50', archived ? 'bg-accent/10 text-accent' : 'bg-surface-2/70 text-foreground')}
          >
            <Archive className="h-4 w-4" /> {archived ? 'إلغاء الأرشفة' : 'أرشفة'}
          </button>
        </div>

        {/* Disappearing messages - Rendered only for groups */}
        {conversation.isGroup && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Timer className="h-4 w-4" /> الرسائل المؤقتة
            </p>
            <div className="flex flex-wrap gap-2">
              {DISAPPEARING_OPTIONS.map((opt) => (
                <button
                  key={opt.seconds}
                  onClick={() => setDisappearing(opt.seconds)}
                  disabled={busy || !isAdmin}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50',
                    (conversation.disappearingSeconds ?? 0) === opt.seconds
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-muted-foreground hover:bg-surface-2',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Shared media */}
        <button
          onClick={() => setMediaOpen(true)}
          className="flex w-full items-center gap-2.5 rounded-xl2 bg-surface-2/60 px-3 py-2.5 text-sm text-foreground hover:bg-surface-2"
        >
          <ImageIcon className="h-4 w-4 text-muted-foreground" /> الوسائط والملفات والروابط
        </button>

        {/* Group members */}
        {conversation.isGroup && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">الأعضاء ({conversation.participants?.length ?? 0})</p>
              {isAdmin && (
                <button onClick={() => setAddingMember((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-accent">
                  <UserPlus className="h-3.5 w-3.5" /> إضافة
                </button>
              )}
            </div>

            {addingMember && (
              <div className="mb-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="ابحث لإضافة عضو"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="ps-9"
                  />
                </div>
                <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto scrollbar-thin">
                  {results.map((r) => (
                    <button
                      key={r._id}
                      onClick={() => addMember(r._id)}
                      className="flex w-full items-center gap-2.5 rounded-xl2 px-2 py-2 text-start hover:bg-surface-2"
                    >
                      <Avatar src={assetUrl(r.photoUrl)} name={r.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              {(conversation.participants || []).map((p) => {
                if (!p) return null;
                const memberIsAdmin = conversation.admins?.includes(p._id);
                const isCreator = conversation.createdBy === p._id;
                return (
                  <div key={p._id} className="flex items-center gap-2.5 rounded-xl2 px-2 py-2">
                    <Avatar src={assetUrl(p.photoUrl)} name={p.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 truncate text-sm font-medium text-foreground">
                        {p.name} {memberIsAdmin && <Crown className="h-3 w-3 text-amber-500" />}
                      </p>
                      <RoleBadge role={p.role} />
                    </div>
                    {isAdmin && p._id !== user._id && !isCreator && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleAdmin(p._id, !memberIsAdmin)}
                          title={memberIsAdmin ? 'إلغاء الإشراف' : 'ترقية لمشرف'}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-accent"
                        >
                          <Crown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => removeMember(p._id)}
                          title="إزالة"
                          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-danger"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Danger zone */}
        <div className="space-y-1 border-t border-border pt-3">
          <button
            disabled={busy}
            onClick={clearChat}
            className="flex w-full items-center gap-2.5 rounded-xl2 px-2 py-2.5 text-start text-sm text-foreground hover:bg-surface-2 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> مسح الرسائل
          </button>
          {!conversation.isGroup && (
            <button
              disabled={busy}
              onClick={toggleBlock}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-xl2 px-2 py-2.5 text-start text-sm hover:bg-surface-2 disabled:opacity-50',
                blocked ? 'text-accent' : 'text-foreground',
              )}
            >
              <ShieldOff className="h-4 w-4" /> {blocked ? 'إلغاء حظر المستخدم' : 'حظر المستخدم'}
            </button>
          )}
          <button
            disabled={busy}
            onClick={deleteConversation}
            className="flex w-full items-center gap-2.5 rounded-xl2 px-2 py-2.5 text-start text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> حذف المحادثة
          </button>
          {conversation.isGroup && (
            <button
              disabled={busy}
              onClick={leaveGroup}
              className="flex w-full items-center gap-2.5 rounded-xl2 px-2 py-2.5 text-start text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" /> مغادرة المجموعة
            </button>
          )}
        </div>
      </div>
      <SharedMediaPanel open={mediaOpen} onClose={() => setMediaOpen(false)} conversationId={conversation._id} />
    </Modal>
  );
}