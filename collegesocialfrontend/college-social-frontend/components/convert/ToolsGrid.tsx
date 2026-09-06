'use client';

import Link from 'next/link';
import { ArrowRight, Droplets, FileArchive, FileMinus2, Images, Layers, ListOrdered, Lock, LockOpen, RotateCw, ScanText, Scissors, Wrench } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';

const TOOLS: { slug: string; label: string; description: string; icon: typeof Wrench }[] = [
  { slug: 'merge', label: 'دمج PDF', description: 'ادمج عدّة ملفات PDF في ملف واحد بالترتيب الذي تريده', icon: Layers },
  { slug: 'split', label: 'تقسيم PDF', description: 'قسّم ملف PDF إلى عدّة ملفات منفصلة', icon: Scissors },
  { slug: 'reorder', label: 'إعادة ترتيب الصفحات', description: 'أعد ترتيب صفحات ملف PDF بالسحب والإفلات', icon: ListOrdered },
  { slug: 'rotate', label: 'تدوير الصفحات', description: 'دوّر صفحة أو أكثر داخل ملف PDF', icon: RotateCw },
  { slug: 'pages', label: 'استخراج / حذف صفحات', description: 'احتفظ بصفحات معيّنة فقط أو احذفها من الملف', icon: FileMinus2 },
  { slug: 'images-to-pdf', label: 'صور إلى PDF', description: 'حوّل مجموعة صور إلى ملف PDF واحد', icon: Images },
  { slug: 'watermark', label: 'علامة مائية', description: 'أضف نص علامة مائية إلى كل صفحات الملف', icon: Droplets },
  { slug: 'compress', label: 'ضغط PDF', description: 'قلّل حجم ملف PDF', icon: FileArchive },
  { slug: 'ocr', label: 'تعرّف ضوئي (OCR)', description: 'حوّل PDF ممسوح ضوئيًا إلى ملف قابل للبحث', icon: ScanText },
  { slug: 'protect', label: 'حماية بكلمة مرور', description: 'أضف كلمة مرور لفتح ملف PDF', icon: Lock },
  { slug: 'remove-password', label: 'إزالة كلمة المرور', description: 'أزل كلمة المرور من ملف PDF محمي', icon: LockOpen },
];

export function ToolsGrid() {
  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Wrench}
        title="أدوات PDF"
        description="أدوات متقدمة للتعامل مع ملفات PDF"
        action={
          <Link href="/convert" className="inline-flex items-center gap-1.5 text-accent hover:underline">
            <ArrowRight className="h-3.5 w-3.5" />
            محوّل الصيغ
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <Link key={t.slug} href={`/convert/tools/${t.slug}`}>
            <Card className="flex h-full items-start gap-3 p-4 transition-colors hover:border-accent/50">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <t.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{t.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t.description}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
