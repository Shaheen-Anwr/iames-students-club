import Link from 'next/link';
import { ArrowRight, ListOrdered } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ReorderPanel } from '@/components/convert/tools/ReorderPanel';

export const metadata = { title: 'إعادة ترتيب الصفحات' };

export default function ReorderToolPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <SectionHeader
          icon={ListOrdered}
          title="إعادة ترتيب الصفحات"
          description="أعد ترتيب صفحات ملف PDF بالسحب والإفلات"
          action={
            <Link href="/convert/tools" className="inline-flex items-center gap-1.5 text-accent hover:underline">
              <ArrowRight className="h-3.5 w-3.5" />
              الأدوات
            </Link>
          }
        />
        <ReorderPanel />
      </div>
    </div>
  );
}
