import Link from 'next/link';
import { ArrowRight, FileArchive } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { CompressPanel } from '@/components/convert/tools/CompressPanel';

export const metadata = { title: 'ضغط PDF' };

export default function CompressToolPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <SectionHeader
          icon={FileArchive}
          title="ضغط PDF"
          description="قلّل حجم ملف PDF"
          action={
            <Link href="/convert/tools" className="inline-flex items-center gap-1.5 text-accent hover:underline">
              <ArrowRight className="h-3.5 w-3.5" />
              الأدوات
            </Link>
          }
        />
        <CompressPanel />
      </div>
    </div>
  );
}
