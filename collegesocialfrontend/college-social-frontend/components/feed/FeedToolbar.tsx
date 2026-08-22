'use client';

import { ChevronDown, Info } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from '@/lib/departments';
import { ACADEMIC_YEARS, ACADEMIC_YEAR_LABELS, getAcademicYearsForDepartment, type AcademicYear } from '@/lib/academic-years';
import { SPECIALIZATIONS_BY_DEPARTMENT, SPECIALIZATION_LABELS, type Specialization } from '@/lib/specializations';
import type { PostScope } from '@/lib/types';
import { CourseChips } from './CourseChips';

export type SortMode = 'latest' | 'engaged' | 'department' | 'academicYear' | 'specialization';

const SORT_LABELS: Record<SortMode, string> = {
  latest: 'الأحدث',
  engaged: 'الأكثر تفاعلاً',
  department: 'الشعبة',
  academicYear: 'السنة الدراسية',
  specialization: 'التخصص',
};

const SELECT_CLASS =
  'h-8 appearance-none rounded-lg border border-border bg-surface-2 ps-2 pe-6 text-xs text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50';

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
          'pointer-events-none absolute end-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground',
          disabled && 'opacity-50',
        )}
      />
    </div>
  );
}

// Sticky control bar for the feed: scope tabs + course chips + department/year/specialization
// filters + a sort toggle, all in one glass panel that stays visible while scrolling -- reads as
// one "environment" instead of several unrelated rows stacked above the post list.
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

  return (
    <div className="glass sticky top-0 z-10 space-y-3 rounded-2xl p-3 shadow-soft">
      {showScopeTabs && (
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
          <button
            onClick={() => onScopeChange('department')}
            className={cn(
              'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors',
              scope === 'department' ? 'bg-gradient-accent text-white shadow-glow' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {departmentLabel}
          </button>
          <button
            onClick={() => onScopeChange('public')}
            className={cn(
              'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors',
              scope === 'public' ? 'bg-gradient-accent text-white shadow-glow' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            عام
          </button>
        </div>
      )}

      <CourseChips value={courseCode} onChange={onCourseChange} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {showDepartmentFilter && (
            <Select value={department} onChange={(e) => handleDepartmentChange(e.target.value as Department | '')}>
              <option value="">كل الشعب</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {DEPARTMENT_LABELS[d]}
                </option>
              ))}
            </Select>
          )}
          <Select value={academicYear} onChange={(e) => onAcademicYearChange(e.target.value as AcademicYear | '')}>
            <option value="">كل السنوات</option>
            {academicYearOptions.map((y) => (
              <option key={y} value={y}>
                {ACADEMIC_YEAR_LABELS[y]}
              </option>
            ))}
          </Select>
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
        </div>

        <div className="flex items-center gap-1.5">
          <Tooltip content="يرتّب المنشورات المحمّلة حاليًا فقط، وليس كل المنشورات" side="top">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </Tooltip>
          <Select value={sortMode} onChange={(e) => onSortChange(e.target.value as SortMode)}>
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {SORT_LABELS[mode]}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}
