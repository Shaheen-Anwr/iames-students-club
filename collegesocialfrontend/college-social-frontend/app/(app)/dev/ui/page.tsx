'use client';

/**
 * Design-system gallery -- dev-only review surface for the Phase A foundation (tokens, motion)
 * and, as they land, the reworked primitives. Open at /dev/ui, toggle the theme from the
 * navbar, and check everything holds up in the app's RTL layout.
 *
 * Not linked anywhere in the product nav on purpose.
 */

import { useState } from 'react';
import { Sparkles, Heart, Bell, Check, Pencil, Trash2, Inbox, List, LayoutGrid, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Tabs } from '@/components/ui/Tabs';
import { Tooltip } from '@/components/ui/Tooltip';
import { Modal } from '@/components/ui/Modal';
import { Sheet } from '@/components/ui/Sheet';
import { Dropdown } from '@/components/ui/Dropdown';
import { Switch } from '@/components/ui/Switch';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';
import { FadeIn, Stagger, Pressable } from '@/components/ui/Motion';
import { motion } from '@/lib/motion';

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Swatch({ label, className }: { label: string; className: string }) {
  return (
    <div className="space-y-1.5">
      <div className={`h-14 rounded-xl border border-subtle ${className}`} />
      <p className="text-center text-[11px] font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

const ACCENT_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const FLUID_STEPS = ['fluid-xs', 'fluid-sm', 'fluid-base', 'fluid-lg', 'fluid-xl', 'fluid-2xl', 'fluid-3xl'] as const;
const ELEV_STEPS = ['elev-1', 'elev-2', 'elev-3', 'elev-4'] as const;

export default function DevUiPage() {
  const [tab, setTab] = useState('one');
  const [fadeKey, setFadeKey] = useState(0);
  const [progress, setProgress] = useState(42);
  const [modalOpen, setModalOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notify, setNotify] = useState(true);
  const [view, setView] = useState<'list' | 'grid'>('list');

  return (
    <div className="mx-auto w-full max-w-4xl space-y-12 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-fluid-2xl font-bold text-foreground text-balance">
          نظام التصميم — لوحة المراجعة
        </h1>
        <p className="text-sm text-muted-foreground">
          Phase A foundation + Phase B primitives. Toggle light/dark from the navbar. Resize to a
          phone width (&lt; 768px): <strong>Modal</strong> and <strong>Dropdown</strong> flip to
          drag-to-dismiss bottom sheets.
        </p>
      </header>

      <Section
        title="Surfaces & borders"
        hint="Revamped palette — greys tinted toward the accent hue, even luminance steps for layering. Toggle dark from the navbar to see the violet-charcoal ground."
      >
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Swatch label="background" className="bg-background" />
          <Swatch label="surface" className="bg-surface" />
          <Swatch label="surface-2" className="bg-surface-2" />
          <Swatch label="surface-3" className="bg-surface-3" />
          <Swatch label="border-subtle" className="bg-surface !border-subtle border-2" />
          <Swatch label="border-strong" className="bg-surface !border-strong border-2" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Swatch label="success-surface" className="bg-success-surface" />
          <Swatch label="warning-surface" className="bg-warning-surface" />
          <Swatch label="danger-surface" className="bg-danger-surface" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="bg-mesh flex h-28 items-end rounded-2xl border border-subtle p-4">
            <span className="text-xs font-medium text-muted-foreground">.bg-mesh</span>
          </div>
          <div className="flex h-28 items-center justify-center rounded-2xl border border-subtle bg-surface">
            <span className="text-gradient-accent text-2xl font-extrabold">النادي الطلابي</span>
          </div>
        </div>
      </Section>

      <Section title="Accent ramp" hint="--accent stays the canonical mid-tone; steps 50–950 back soft fills and pressed states.">
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
          {ACCENT_STEPS.map((s) => (
            <div key={s} className="space-y-1.5">
              <div className={`h-12 rounded-lg bg-accent-${s}`} />
              <p className="text-center text-[10px] text-muted-foreground">{s}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="accent">accent</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="warning">warning</Badge>
          <Badge variant="danger">danger</Badge>
          <Badge>default</Badge>
        </div>
      </Section>

      <Section title="Elevation" hint="shadow-elev-1…4 — soft drop shadows in light, hairline + deep cast in dark.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {ELEV_STEPS.map((e) => (
            <div key={e} className={`flex h-24 items-center justify-center rounded-2xl bg-surface shadow-${e}`}>
              <span className="text-xs font-medium text-muted-foreground">{e}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Fluid type scale" hint="text-fluid-* — scales with viewport width via clamp(). Fixed text-xs…2xl are untouched.">
        <Card className="space-y-2 p-5">
          {FLUID_STEPS.map((f) => (
            <p key={f} className={`text-${f} font-semibold text-foreground text-balance`}>
              <span className="me-2 align-middle text-xs font-normal text-muted-foreground">{f}</span>
              نظام التصميم the quick brown fox
            </p>
          ))}
        </Card>
      </Section>

      <Section title="Motion" hint="Springs & helpers from lib/motion.ts. Respects OS reduce-motion via MotionConfig.">
        <Card className="space-y-6 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Pressable className="rounded-xl bg-gradient-accent px-4 py-2 text-sm font-medium text-white">
              Pressable
            </Pressable>
            <motion.div
              {...{ whileHover: { y: -2 }, whileTap: { y: 0, scale: 0.99 } }}
              className="cursor-pointer rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-elev-1"
            >
              hover-lift card
            </motion.div>
          </div>

          <div className="space-y-2">
            <Button size="sm" variant="outline" onClick={() => setFadeKey((k) => k + 1)}>
              replay FadeIn
            </Button>
            <FadeIn key={fadeKey} className="rounded-xl bg-surface-2 p-4 text-sm text-foreground">
              I fade + rise in on mount using <code>fadeInUp</code> + <code>transitions.smooth</code>.
            </FadeIn>
          </div>

          <Stagger key={`s-${fadeKey}`} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {['محاضرات', 'ملفات', 'دردشة', 'اختبارات'].map((label) => (
              <Stagger.Item key={label} className="rounded-xl bg-surface-2 p-4 text-center text-sm font-medium text-foreground">
                {label}
              </Stagger.Item>
            ))}
          </Stagger>
        </Card>
      </Section>

      <Section title="Buttons">
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">أساسي</Button>
            <Button variant="secondary">ثانوي</Button>
            <Button variant="subtle">هادئ</Button>
            <Button variant="outline">محدد</Button>
            <Button variant="ghost">شبح</Button>
            <Button variant="danger">حذف</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="xs">دقيق</Button>
            <Button size="sm">صغير</Button>
            <Button size="md">متوسط</Button>
            <Button size="lg">كبير</Button>
            <Button size="icon" aria-label="نجمة"><Sparkles className="h-4 w-4" /></Button>
            <Button loading>تحميل</Button>
            <Button disabled>معطّل</Button>
          </div>
          <Button fullWidth size="lg">إجراء رئيسي بعرض كامل (موبايل)</Button>
        </Card>
      </Section>

      <Section
        title="Overlays"
        hint="Modal & Dropdown are responsive — centred dialog / anchored menu on desktop, bottom sheet on phones. Sheet is the primitive underneath."
      >
        <Card className="flex flex-wrap gap-3 p-5">
          <Button onClick={() => setModalOpen(true)}>افتح Modal</Button>
          <Button variant="outline" onClick={() => setSheetOpen(true)}>افتح Sheet</Button>
          <Dropdown
            trigger={
              <span className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-strong bg-surface px-4 text-sm font-medium text-foreground">
                قائمة إجراءات
              </span>
            }
            items={[
              { label: 'تعديل', icon: Pencil, onClick: () => {} },
              { label: 'حذف', icon: Trash2, onClick: () => {}, destructive: true },
            ]}
          />
        </Card>
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="عنوان الحوار">
          <p className="text-sm text-muted-foreground">
            على الهاتف هذه ورقة سفلية تُسحب للإغلاق؛ على سطح المكتب حوار في المنتصف. نفس الواجهة
            البرمجية.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>إلغاء</Button>
            <Button onClick={() => setModalOpen(false)}>تأكيد</Button>
          </div>
        </Modal>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="ورقة سفلية" description="اسحب للأسفل للإغلاق">
          <div className="space-y-2">
            {['خيار أول', 'خيار ثانٍ', 'خيار ثالث'].map((o) => (
              <button key={o} className="w-full rounded-xl bg-surface-2 px-4 py-3.5 text-start text-[15px] font-medium text-foreground active:bg-surface-3">
                {o}
              </button>
            ))}
          </div>
        </Sheet>
      </Section>

      <Section title="Controls" hint="Switch (RTL-aware thumb travel) and Segmented (sliding thumb via shared layoutId).">
        <Card className="space-y-5 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">تفعيل الإشعارات</span>
            <Switch checked={notify} onCheckedChange={setNotify} aria-label="الإشعارات" />
          </div>
          <Segmented
            fullWidth
            options={[
              { value: 'list', label: 'قائمة', icon: List },
              { value: 'grid', label: 'شبكة', icon: LayoutGrid },
            ]}
            value={view}
            onChange={setView}
          />
        </Card>
      </Section>

      <Section title="Empty state">
        <Card className="p-5">
          <EmptyState
            icon={Inbox}
            title="لا توجد عناصر بعد"
            description="عندما تُضاف عناصر ستظهر هنا. جرّب البحث أو أنشئ عنصرًا جديدًا."
            action={<Button size="sm" variant="subtle"><Search className="h-4 w-4" />بحث</Button>}
          />
        </Card>
      </Section>

      <Section title="Inputs">
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <Input label="الاسم الكامل" placeholder="اكتب اسمك" name="name" />
          <Input label="البريد الإلكتروني" placeholder="you@example.com" name="email" dir="ltr" />
          <Input label="مع خطأ" defaultValue="قيمة غير صحيحة" error="هذا الحقل مطلوب" name="err" />
          <div className="sm:col-span-2">
            <Textarea placeholder="اكتب تعليقًا…" rows={3} />
          </div>
        </Card>
      </Section>

      <Section title="Tabs / Tooltip / Progress">
        <Card className="space-y-5 p-5">
          <Tabs
            tabs={[
              { id: 'one', label: 'الكل', icon: Bell },
              { id: 'two', label: 'المفضلة', icon: Heart },
              { id: 'three', label: 'المكتملة', icon: Check },
            ]}
            active={tab}
            onChange={setTab}
          />
          <div className="flex flex-wrap items-center gap-4">
            <Tooltip content="تلميح توضيحي">
              <Button variant="outline" size="sm">مرّر هنا</Button>
            </Tooltip>
            <Spinner />
          </div>
          <div className="space-y-2">
            <ProgressBar percent={progress} />
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setProgress((p) => Math.max(0, p - 15))}>-15</Button>
              <Button size="sm" variant="ghost" onClick={() => setProgress((p) => Math.min(100, p + 15))}>+15</Button>
            </div>
          </div>
        </Card>
      </Section>

      <Section title="Avatars & skeletons">
        <Card className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name="سارة أحمد" size="xs" />
            <Avatar name="Omar K" size="sm" online />
            <Avatar name="ليان محمد" size="md" />
            <Avatar name="Yousef" size="lg" ring />
            <Avatar name="نور" size="xl" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SkeletonCard />
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </Card>
      </Section>
    </div>
  );
}
