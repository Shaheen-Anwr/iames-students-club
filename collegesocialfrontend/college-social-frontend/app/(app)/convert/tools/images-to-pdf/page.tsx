import Link from 'next/link';
import { ArrowRight, Images } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ImagesToPdfPanel } from '@/components/convert/tools/ImagesToPdfPanel';

export const metadata = { title: 'صور إلى PDF' };

export default function ImagesToPdfToolPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <SectionHeader
          icon={Images}
          title="صور إلى PDF"
          description="حوّل مجموعة صور إلى ملف PDF واحد"
          action={
            <Link href="/convert/tools" className="inline-flex items-center gap-1.5 text-accent hover:underline">
              <ArrowRight className="h-3.5 w-3.5" />
              الأدوات
            </Link>
          }
        />
        <ImagesToPdfPanel />
      </div>
    </div>
  );
}
