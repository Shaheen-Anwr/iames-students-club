import Link from 'next/link';
import { ArrowRight, LockOpen } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { RemovePasswordPanel } from '@/components/convert/tools/RemovePasswordPanel';

export const metadata = { title: 'إزالة كلمة مرور PDF' };

export default function RemovePasswordToolPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <SectionHeader
          icon={LockOpen}
          title="إزالة كلمة المرور"
          description="أزل كلمة المرور من ملف PDF محمي"
          action={
            <Link href="/convert/tools" className="inline-flex items-center gap-1.5 text-accent hover:underline">
              <ArrowRight className="h-3.5 w-3.5" />
              الأدوات
            </Link>
          }
        />
        <RemovePasswordPanel />
      </div>
    </div>
  );
}
