import { MessagesSquare, Share2, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';

const FEATURES = [
  { icon: Share2, text: 'شارك محاضراتك وملخصاتك وتسجيلاتك في مكان واحد' },
  { icon: MessagesSquare, text: 'تواصل مع زملائك وأساتذتك لحظة بلحظة' },
  { icon: ShieldCheck, text: 'لطلاب وأساتذة IEAMS' },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#05070b] p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-accent-2/20 blur-3xl" />

        <div className="relative">
          <Logo size="md" />
        </div>

        <div className="relative space-y-8">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            كل الجامعه في مكان واحد
          </h1>
          <div className="space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-white/80">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-sm">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/50">مخصصة لطلاب وأساتذة IEAMS Students Community فقط.</p>
      </div>

      <div className="flex h-dvh items-start justify-center overflow-y-auto bg-background px-6 py-8 sm:items-center sm:py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
