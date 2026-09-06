import Link from 'next/link';
import { ArrowRight, Scissors } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SplitPanel } from '@/components/convert/tools/SplitPanel';

export const metadata = { title: 'تقسيم PDF' };

export default function SplitToolPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <SectionHeader
          icon={Scissors}
          title="تقسيم PDF"
          description="قسّم ملف PDF إلى عدّة ملفات"
          action={
            <Link href="/convert/tools" className="inline-flex items-center gap-1.5 text-accent hover:underline">
              <ArrowRight className="h-3.5 w-3.5" />
              الأدوات
            </Link>
          }
        />
        <SplitPanel />
      </div>
    </div>
  );
}
