'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, HelpCircle, Search as SearchIcon, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { Highlight } from '@/components/search/Highlight';
import { api } from '@/lib/api';
import { assetUrl } from '@/lib/utils';
import type { SearchResults } from '@/lib/types';

const EMPTY_RESULTS: SearchResults = { posts: [], questions: [], groups: [], users: [] };

type Filter = 'all' | 'users' | 'posts' | 'questions' | 'groups';

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(q);
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    setQuery(q);
  }, [q]);

  useEffect(() => {
    if (!q.trim()) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get<SearchResults>(`/search?q=${encodeURIComponent(q.trim())}`)
      .then(setResults)
      .finally(() => setLoading(false));
  }, [q]);

  function submitSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  const hasResults = results.users.length || results.posts.length || results.questions.length || results.groups.length;

  const tabs: TabItem[] = [
    { id: 'all', label: 'الكل' },
    { id: 'users', label: `أشخاص (${results.users.length})` },
    { id: 'posts', label: `منشورات (${results.posts.length})` },
    { id: 'questions', label: `أسئلة (${results.questions.length})` },
    { id: 'groups', label: `مجموعات (${results.groups.length})` },
  ];

  const showUsers = hasResults && (filter === 'all' || filter === 'users') && results.users.length > 0;
  const showPosts = hasResults && (filter === 'all' || filter === 'posts') && results.posts.length > 0;
  const showQuestions = hasResults && (filter === 'all' || filter === 'questions') && results.questions.length > 0;
  const showGroups = hasResults && (filter === 'all' || filter === 'groups') && results.groups.length > 0;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-4 py-6">
      <div className="space-y-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
            placeholder="ابحث عن أشخاص، منشورات، أسئلة، مجموعات..."
            className="ps-9"
          />
        </div>
        {q && <h1 className="text-lg font-semibold text-foreground">نتائج البحث عن &quot;{q}&quot;</h1>}
        {hasResults > 0 && <Tabs tabs={tabs} active={filter} onChange={(id) => setFilter(id as Filter)} />}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : !q.trim() ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <SearchIcon className="h-8 w-8" />
          <p className="text-sm">ابحث عن أشخاص أو منشورات أو أسئلة أو مجموعات دراسية.</p>
        </div>
      ) : !hasResults ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <SearchIcon className="h-8 w-8" />
          <p className="text-sm">لا توجد نتائج مطابقة لـ &quot;{q}&quot;.</p>
          <Link href="/feed" className="text-sm font-medium text-accent hover:underline">
            تصفح المنشورات بدلًا من ذلك
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {showUsers && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">أشخاص ({results.users.length})</h2>
              <div className="space-y-1.5">
                {results.users.map((u) => (
                  <Link key={u._id} href={`/profile/${u._id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-2">
                    <Avatar src={assetUrl(u.photoUrl)} name={u.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        <Highlight text={u.name} query={q} />
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{u.collegeId}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {showPosts && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">منشورات ({results.posts.length})</h2>
              <div className="space-y-2">
                {results.posts.map((p) => (
                  <Link key={p._id} href="/feed" className="block">
                    <Card className="flex items-start gap-2.5 p-3 hover:bg-surface-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm text-foreground">
                          <Highlight text={p.caption} query={q} />
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{p.author?.name ?? 'مستخدم محذوف'}</p>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {showQuestions && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">أسئلة ({results.questions.length})</h2>
              <div className="space-y-2">
                {results.questions.map((question) => (
                  <Link key={question._id} href={`/study/qa/${question._id}`} className="block">
                    <Card className="flex items-start gap-2.5 p-3 hover:bg-surface-2">
                      <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          <Highlight text={question.title} query={q} />
                        </p>
                        <p className="line-clamp-1 text-xs text-muted-foreground">{question.body}</p>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {showGroups && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">مجموعات ({results.groups.length})</h2>
              <div className="space-y-2">
                {results.groups.map((group) => (
                  <Link key={group._id} href={`/groups/${group._id}`} className="block">
                    <Card className="flex items-start gap-2.5 p-3 hover:bg-surface-2">
                      <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          <Highlight text={group.name} query={q} />
                        </p>
                        {group.description && <p className="line-clamp-1 text-xs text-muted-foreground">{group.description}</p>}
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
