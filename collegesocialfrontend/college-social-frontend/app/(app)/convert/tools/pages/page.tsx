import Link from 'next/link';
import { ArrowRight, FileMinus2 } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { PagesPanel } from '@/components/convert/tools/PagesPanel';

export const metadata = { title: 'استخراج / حذف صفحات' };

export default function PagesToolPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <SectionHeader
          icon={FileMinus2}
          title="استخراج / حذف صفحات"
          description="احتفظ بصفحات معيّنة فقط أو احذفها من ملف PDF"
          action={
            <Link href="/convert/tools" className="inline-flex items-center gap-1.5 text-accent hover:underline">
              <ArrowRight className="h-3.5 w-3.5" />
              الأدوات
            </Link>
          }
        />
        <PagesPanel />
      </div>
    </div>
  );
}
