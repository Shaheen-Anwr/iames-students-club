import Link from 'next/link';
import { ArrowRight, Droplets } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { WatermarkPanel } from '@/components/convert/tools/WatermarkPanel';

export const metadata = { title: 'علامة مائية' };

export default function WatermarkToolPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <SectionHeader
          icon={Droplets}
          title="علامة مائية"
          description="أضف نص علامة مائية إلى كل صفحات ملف PDF"
          action={
            <Link href="/convert/tools" className="inline-flex items-center gap-1.5 text-accent hover:underline">
              <ArrowRight className="h-3.5 w-3.5" />
              الأدوات
            </Link>
          }
        />
        <WatermarkPanel />
      </div>
    </div>
  );
}
