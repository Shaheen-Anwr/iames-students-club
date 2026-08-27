'use client';

import { useState } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Segmented } from '@/components/ui/Segmented';
import { cn } from '@/lib/utils';
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from '@/lib/departments';
import { ACADEMIC_YEARS, ACADEMIC_YEAR_LABELS, getAcademicYearsForDepartment, type AcademicYear } from '@/lib/academic-years';
import { SPECIALIZATIONS_BY_DEPARTMENT, SPECIALIZATION_LABELS, type Specialization } from '@/lib/specializations';
import type { PostScope } from '@/lib/types';
import { CourseChips } from './CourseChips';
import { SortMenu, type SortMode } from './SortMenu';

export type { SortMode };

const SELECT_CLASS =
  'h-8 w-full appearance-none rounded-lg border border-border bg-surface-2 ps-2.5 pe-7 text-xs text-foreground transition-colors hover:bg-surface-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50';

// Native <select>s don't take a `disabled` chevron color, so this wrapper carries a decorative
// ChevronDown instead of relying on each browser/OS's own arrow -- keeps the selects looking
// designed rather than like raw form controls.
function Select({ className, disabled, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select disabled={disabled} className={cn(SELECT_CLASS, className)} {...props}>
        {children}
      </select>
      <ChevronDown
        className={cn(
          'pointer-events-none absolute end-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground',
          disabled && 'opacity-50',
        )}
      />
    </div>
  );
}

function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/10 py-1 ps-2.5 pe-1 text-xs font-medium text-accent">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`إزالة عامل التصفية: ${label}`}
        className="rounded-full p-0.5 transition-colors hover:bg-accent/20"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// Sticky control bar for the feed: scope tabs + course chips + department/year/specialization
// filters + a sort toggle, all in one glass panel that stays visible while scrolling -- reads as
// one "environment" instead of several unrelated rows stacked above the post list. On phones the
// three filter <select>s collapse behind a "تصفية" button (with an active-count badge) that
// opens a bottom sheet; the active filters stay visible as removable pills.
export function FeedToolbar({
  scope,
  onScopeChange,
  showScopeTabs,
  departmentLabel,
  viewerDepartment,
  courseCode,
  onCourseChange,
  department,
  onDepartmentChange,
  academicYear,
  onAcademicYearChange,
  specialization,
  onSpecializationChange,
  sortMode,
  onSortChange,
}: {
  scope: PostScope;
  onScopeChange: (scope: PostScope) => void;
  showScopeTabs: boolean;
  departmentLabel?: string;
  viewerDepartment?: Department;
  courseCode: string | null;
  onCourseChange: (courseCode: string | null) => void;
  department: Department | '';
  onDepartmentChange: (department: Department | '') => void;
  academicYear: AcademicYear | '';
  onAcademicYearChange: (academicYear: AcademicYear | '') => void;
  specialization: Specialization | '';
  onSpecializationChange: (specialization: Specialization | '') => void;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
}) {
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // The department filter only matters on the "عام" tab -- the "قسمي" tab is already locked
  // server-side to the viewer's own department, so a department picker there would do nothing.
  const showDepartmentFilter = scope === 'public';
  // On the "قسمي" tab there's no department filter to read from, but the year/specialization
  // options still need to match the viewer's own department (e.g. business admin tops out at
  // year 4 and only offers its own 3 majors) rather than defaulting to "all departments".
  const effectiveDepartment = showDepartmentFilter ? department : viewerDepartment ?? '';
  const academicYearOptions = effectiveDepartment ? getAcademicYearsForDepartment(effectiveDepartment) : ACADEMIC_YEARS;
  const specializationOptions = effectiveDepartment ? SPECIALIZATIONS_BY_DEPARTMENT[effectiveDepartment] : [];

  function handleDepartmentChange(value: Department | '') {
    onDepartmentChange(value);
    onSpecializationChange('');
    if (value && !getAcademicYearsForDepartment(value).includes(academicYear as AcademicYear)) {
      onAcademicYearChange('');
    }
  }

  function clearAllFilters() {
    if (showDepartmentFilter) onDepartmentChange('');
    onAcademicYearChange('');
    onSpecializationChange('');
  }

  const activeFilters = [
    showDepartmentFilter && department
      ? { key: 'department', label: DEPARTMENT_LABELS[department], clear: () => handleDepartmentChange('') }
      : null,
    academicYear ? { key: 'academicYear', label: ACADEMIC_YEAR_LABELS[academicYear], clear: () => onAcademicYearChange('') } : null,
    specialization
      ? { key: 'specialization', label: SPECIALIZATION_LABELS[specialization], clear: () => onSpecializationChange('') }
      : null,
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const departmentSelect = showDepartmentFilter && (
    <Select value={department} onChange={(e) => handleDepartmentChange(e.target.value as Department | '')}>
      <option value="">كل الشعب</option>
      {DEPARTMENTS.map((d) => (
        <option key={d} value={d}>
          {DEPARTMENT_LABELS[d]}
        </option>
      ))}
    </Select>
  );

  const academicYearSelect = (
    <Select value={academicYear} onChange={(e) => onAcademicYearChange(e.target.value as AcademicYear | '')}>
      <option value="">كل السنوات</option>
      {academicYearOptions.map((y) => (
        <option key={y} value={y}>
          {ACADEMIC_YEAR_LABELS[y]}
        </option>
      ))}
    </Select>
  );

  const specializationSelect = (
    <Select
      value={specialization}
      onChange={(e) => onSpecializationChange(e.target.value as Specialization | '')}
      disabled={!effectiveDepartment}
    >
      <option value="">{effectiveDepartment ? 'كل التخصصات' : 'التخصص'}</option>
      {specializationOptions.map((s) => (
        <option key={s} value={s}>
          {SPECIALIZATION_LABELS[s]}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="glass sticky top-0 z-10 space-y-3 rounded-2xl p-3 shadow-elev-2">
      {showScopeTabs && (
        <Segmented
          fullWidth
          size="sm"
          value={scope}
          onChange={(next) => onScopeChange(next as PostScope)}
          options={[
            { value: 'department', label: departmentLabel ?? 'قسمي' },
            { value: 'public', label: 'عام' },
          ]}
        />
      )}

      <CourseChips value={courseCode} onChange={onCourseChange} />

      <div className="flex items-center gap-2">
        {/* Phones: filters live behind this button + a bottom sheet. */}
        <button
          type="button"
          onClick={() => setFilterSheetOpen(true)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 ps-2.5 pe-2.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-3 md:hidden"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          تصفية
          {activeFilters.length > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white">
              {activeFilters.length}
            </span>
          )}
        </button>

        {/* Desktop: the three selects sit inline. */}
        <div className="hidden flex-wrap items-center gap-1.5 md:flex">
          {departmentSelect}
          {academicYearSelect}
          {specializationSelect}
          {activeFilters.length > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              مسح الكل
            </button>
          )}
        </div>

        {/* Phones: active filters as removable pills, horizontally scrollable. */}
        {activeFilters.length > 0 && (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none md:hidden">
            {activeFilters.map((f) => (
              <FilterPill key={f.key} label={f.label} onClear={f.clear} />
            ))}
          </div>
        )}

        <div className="ms-auto shrink-0">
          <SortMenu value={sortMode} onChange={onSortChange} />
        </div>
      </div>

      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen} title="تصفية المنشورات">
        <div className="space-y-4 [&_select]:h-11 [&_select]:text-sm">
          {showDepartmentFilter && (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">الشعبة</span>
              {departmentSelect}
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">السنة الدراسية</span>
            {academicYearSelect}
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">التخصص</span>
            {specializationSelect}
          </label>
          {activeFilters.length > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-4 w-4" />
              مسح كل عوامل التصفية
            </button>
          )}
        </div>
      </Sheet>
    </div>
  );
}
