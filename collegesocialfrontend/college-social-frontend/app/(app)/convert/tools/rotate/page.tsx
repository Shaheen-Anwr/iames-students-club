import Link from 'next/link';
import { ArrowRight, RotateCw } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { RotatePanel } from '@/components/convert/tools/RotatePanel';

export const metadata = { title: 'تدوير الصفحات' };

export default function RotateToolPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <SectionHeader
          icon={RotateCw}
          title="تدوير الصفحات"
          description="دوّر صفحة أو أكثر داخل ملف PDF"
          action={
            <Link href="/convert/tools" className="inline-flex items-center gap-1.5 text-accent hover:underline">
              <ArrowRight className="h-3.5 w-3.5" />
              الأدوات
            </Link>
          }
        />
        <RotatePanel />
      </div>
    </div>
  );
}
