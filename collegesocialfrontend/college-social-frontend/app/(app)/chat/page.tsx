import { MessageCircle } from 'lucide-react';

export default function ChatIndexPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-surface-2 px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface shadow-soft">
        <MessageCircle className="h-9 w-9 text-muted-foreground" />
      </div>
      <div className="max-w-xs space-y-1.5">
        <p className="text-base font-semibold text-foreground">رسائلك</p>
        <p className="text-sm text-muted-foreground">
          اختر محادثة من القائمة لبدء الدردشة، أو ابدأ محادثة جديدة من زر <span className="font-medium text-foreground">＋</span> بالأعلى.
        </p>
      </div>
    </div>
  );
}
