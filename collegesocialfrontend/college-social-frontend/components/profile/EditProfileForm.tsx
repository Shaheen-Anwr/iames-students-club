'use client';

import { FormEvent, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { PendingVerificationNotice } from '@/components/auth/PendingVerificationNotice';
import { BadgeShelf } from '@/components/gamification/BadgeShelf';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from '@/lib/departments';
import { ACADEMIC_YEAR_LABELS, getAcademicYearsForDepartment, type AcademicYear } from '@/lib/academic-years';
import { SPECIALIZATIONS_BY_DEPARTMENT, SPECIALIZATION_LABELS, type Specialization } from '@/lib/specializations';
import type { User } from '@/lib/types';

const SELECT_CLASS =
  'h-10 w-full rounded-lg border border-border bg-surface-2/70 px-3 text-sm text-foreground transition-colors focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50';

export function EditProfileForm({ user }: { user: User }) {
  const { updateLocalUser } = useAuth();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [collegeEmail, setCollegeEmail] = useState(user.collegeEmail);
  const [bio, setBio] = useState(user.bio ?? '');
  const [department, setDepartment] = useState<Department | ''>(user.department ?? '');
  const [academicYear, setAcademicYear] = useState<AcademicYear | ''>(user.academicYear ?? '');
  const [specialization, setSpecialization] = useState<Specialization | ''>(user.specialization ?? '');
  const [saving, setSaving] = useState(false);

  const verified = !!user.collegeEmailVerifiedAt;
  const academicYearOptions = department ? getAcademicYearsForDepartment(department) : [];
  const specializationOptions = department ? SPECIALIZATIONS_BY_DEPARTMENT[department] : [];

  function handleDepartmentChange(value: Department | '') {
    setDepartment(value);
    setSpecialization('');
    if (value && !getAcademicYearsForDepartment(value).includes(academicYear as AcademicYear)) {
      setAcademicYear('');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.patch<User>('/users/me', {
        name: name.trim(),
        collegeEmail: collegeEmail.trim(),
        bio: bio.trim(),
        department: department || undefined,
        academicYear: academicYear || undefined,
        specialization: specialization || undefined,
      });
      updateLocalUser(updated);
      setEditing(false);
      showToast('تم تحديث الملف الشخصي.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تحديث الملف الشخصي.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">معلومات التواصل</h2>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
            تعديل
          </Button>
        </div>
        <dl className="mt-4 space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">البريد الجامعي</dt>
            <dd className="flex items-center gap-2 font-medium text-foreground">
              <bdi dir="ltr">{user.collegeEmail}</bdi>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium',
                  verified ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
                )}
              >
                {verified ? 'موثّق' : 'غير موثّق'}
              </span>
            </dd>
          </div>
          {user.bio && (
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-muted-foreground">نبذة</dt>
              <dd className="whitespace-pre-wrap text-end font-medium text-foreground">{user.bio}</dd>
            </div>
          )}
          {user.department && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">الشعبة</dt>
              <dd className="font-medium text-foreground">{DEPARTMENT_LABELS[user.department]}</dd>
            </div>
          )}
          {user.academicYear && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">السنة الدراسية</dt>
              <dd className="font-medium text-foreground">{ACADEMIC_YEAR_LABELS[user.academicYear]}</dd>
            </div>
          )}
          {user.specialization && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">التخصص</dt>
              <dd className="font-medium text-foreground">{SPECIALIZATION_LABELS[user.specialization]}</dd>
            </div>
          )}
        </dl>
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="mb-2.5 text-xs font-semibold text-muted-foreground">الإنجازات</h3>
          <BadgeShelf badges={user.badges ?? []} />
        </div>
        {!verified && (
          <div className="mt-4 border-t border-border pt-4">
            <PendingVerificationNotice />
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">تعديل الملف الشخصي</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="الاسم الكامل" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="البريد الجامعي" type="email" dir="ltr" value={collegeEmail} onChange={(e) => setCollegeEmail(e.target.value)} required />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">نبذة</label>
          <Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="اكتب نبذة قصيرة عن نفسك..." maxLength={500} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">الشعبة</label>
            <select value={department} onChange={(e) => handleDepartmentChange(e.target.value as Department | '')} className={SELECT_CLASS}>
              <option value="">بدون شعبة</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {DEPARTMENT_LABELS[dept]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">السنة الدراسية</label>
            <select
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value as AcademicYear | '')}
              disabled={!department}
              className={SELECT_CLASS}
            >
              <option value="">{department ? 'بدون سنة دراسية' : 'اختر الشعبة أولًا'}</option>
              {academicYearOptions.map((y) => (
                <option key={y} value={y}>
                  {ACADEMIC_YEAR_LABELS[y]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm font-medium text-foreground">التخصص</label>
            <select
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value as Specialization | '')}
              disabled={!department}
              className={SELECT_CLASS}
            >
              <option value="">{department ? 'بدون تخصص' : 'اختر الشعبة أولًا'}</option>
              {specializationOptions.map((s) => (
                <option key={s} value={s}>
                  {SPECIALIZATION_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2.5 pt-1">
          <Button type="submit" size="sm" loading={saving}>
            حفظ التغييرات
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
            إلغاء
          </Button>
        </div>
      </form>
    </Card>
  );
}
