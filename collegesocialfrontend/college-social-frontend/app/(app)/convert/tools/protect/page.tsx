import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ProtectPanel } from '@/components/convert/tools/ProtectPanel';

export const metadata = { title: 'حماية PDF بكلمة مرور' };

export default function ProtectToolPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <SectionHeader
          icon={Lock}
          title="حماية بكلمة مرور"
          description="أضف كلمة مرور لفتح ملف PDF"
          action={
            <Link href="/convert/tools" className="inline-flex items-center gap-1.5 text-accent hover:underline">
              <ArrowRight className="h-3.5 w-3.5" />
              الأدوات
            </Link>
          }
        />
        <ProtectPanel />
      </div>
    </div>
  );
}
