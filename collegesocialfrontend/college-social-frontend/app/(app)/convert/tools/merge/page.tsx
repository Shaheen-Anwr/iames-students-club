import Link from 'next/link';
import { ArrowRight, Layers } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { MergePanel } from '@/components/convert/tools/MergePanel';

export const metadata = { title: 'دمج PDF' };

export default function MergeToolPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <SectionHeader
          icon={Layers}
          title="دمج PDF"
          description="ادمج عدّة ملفات PDF في ملف واحد"
          action={
            <Link href="/convert/tools" className="inline-flex items-center gap-1.5 text-accent hover:underline">
              <ArrowRight className="h-3.5 w-3.5" />
              الأدوات
            </Link>
          }
        />
        <MergePanel />
      </div>
    </div>
  );
}
