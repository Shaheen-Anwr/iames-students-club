import Link from 'next/link';
import { ArrowRight, ScanText } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { OcrPanel } from '@/components/convert/tools/OcrPanel';

export const metadata = { title: 'التعرّف الضوئي على النص' };

export default function OcrToolPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <SectionHeader
          icon={ScanText}
          title="التعرّف الضوئي على النص (OCR)"
          description="حوّل ملف PDF ممسوح ضوئيًا إلى ملف قابل للبحث والتحديد"
          action={
            <Link href="/convert/tools" className="inline-flex items-center gap-1.5 text-accent hover:underline">
              <ArrowRight className="h-3.5 w-3.5" />
              الأدوات
            </Link>
          }
        />
        <OcrPanel />
      </div>
    </div>
  );
}
