import { MessageCircle, Phone, Sparkles } from 'lucide-react';

// Desktop's empty conversation pane (phones show the list instead). Same wallpaper as an open
// thread, so picking a chat feels like the canvas filling in rather than a page swap.
export default function ChatIndexPage() {
  return (
    <div className="chat-wallpaper flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="relative">
        <div aria-hidden className="absolute -inset-6 rounded-full bg-accent/20 blur-2xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-gradient-accent text-white shadow-glow">
          <MessageCircle className="h-9 w-9" />
        </div>
      </div>
      <div className="max-w-sm space-y-1.5">
        <p className="text-lg font-bold tracking-tight text-foreground">رسائلك</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          اختر محادثة من القائمة لبدء الدردشة، أو ابدأ محادثة جديدة من زر <span className="font-medium text-foreground">＋</span> بالأعلى.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 rounded-full bg-surface/85 px-3 py-1.5 shadow-elev-1 ring-1 ring-border/50 backdrop-blur">
          <Phone className="h-3.5 w-3.5 text-accent" /> مكالمات صوت وفيديو
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-surface/85 px-3 py-1.5 shadow-elev-1 ring-1 ring-border/50 backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-accent" /> ملخص ذكي لما فاتك
        </span>
      </div>
    </div>
  );
}
