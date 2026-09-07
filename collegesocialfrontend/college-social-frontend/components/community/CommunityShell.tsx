import { CommunityTabs } from './CommunityTabs';

// Wraps the single-column community boards (wall / events / marketplace) with the shared
// "المجتمع" hub strip, pinned while the board scrolls inside AppShell's <main>.
export function CommunityShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl px-4 py-2.5">
          <CommunityTabs />
        </div>
      </div>
      {children}
    </div>
  );
}
