'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { RoleBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { assetUrl, cn } from '@/lib/utils';
import type { PopulatedReaction } from '@/lib/types';
import { REACTION_COLORS, ReactionIcon } from './reaction-icons';

// "Seen by" reactions modal, shared between posts and comments -- fetched lazily since most
// reaction lists are never opened (see PostsService.listReactions()/listCommentReactions()).
export function ReactionsListModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [reactions, setReactions] = useState<PopulatedReaction[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<PopulatedReaction[]>(url)
      .then((data) => {
        if (!cancelled) setReactions(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <Modal open onClose={onClose} title="التفاعلات">
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5" />
        </div>
      ) : reactions.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">لا توجد تفاعلات بعد</p>
      ) : (
        <div className="max-h-96 space-y-1 overflow-y-auto scrollbar-thin">
          {reactions.map((r, i) => (
            <Link
              key={i}
              href={`/profile/${r.user._id}`}
              onClick={onClose}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2"
            >
              <Avatar src={assetUrl(r.user.photoUrl)} name={r.user.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-foreground">{r.user.name}</p>
                  <RoleBadge role={r.user.role} />
                </div>
              </div>
              <span className={cn('flex h-7 w-7 items-center justify-center rounded-full', REACTION_COLORS[r.type].bg, REACTION_COLORS[r.type].text)}>
                <ReactionIcon type={r.type} className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </Modal>
  );
}
