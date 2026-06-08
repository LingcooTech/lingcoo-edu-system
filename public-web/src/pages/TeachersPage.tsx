import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, GraduationCap, Search, X } from 'lucide-react';

import {
  fetchPublicInstitutions,
  fetchPublicTeachers,
  type PublicInstitution,
  type PublicTeacher,
} from '@/api/client';
import { Layout } from '@/components/Layout';

export function TeachersPage() {
  const [teachers, setTeachers] = useState<PublicTeacher[]>([]);
  const [institutions, setInstitutions] = useState<PublicInstitution[]>([]);
  const [activeInstitution, setActiveInstitution] = useState<string>(''); // '' = 全部
  const [query, setQuery] = useState('');
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchPublicTeachers(), fetchPublicInstitutions()])
      .then(([teacherList, institutionList]) => {
        setTeachers(teacherList);
        setInstitutions(institutionList);
      })
      .catch(() => {
        setTeachers([]);
        setInstitutions([]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Keep the institution order from the backend; only the ones that actually have
  // teachers. We only surface the institution filter when there are 2+ to choose from.
  const institutionTabs = useMemo(
    () => institutions.filter((inst) => teachers.some((t) => t.institutionId === inst.id)),
    [institutions, teachers],
  );
  const showInstitutionFilter = institutionTabs.length >= 2;

  const countByInstitution = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of teachers) {
      if (t.institutionId) map.set(t.institutionId, (map.get(t.institutionId) ?? 0) + 1);
    }
    return map;
  }, [teachers]);

  // Aggregate specialties across all teachers (most common first) for faceted filtering.
  const specialtyOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of teachers) for (const s of t.specialties) counts.set(s, (counts.get(s) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([s]) => s);
  }, [teachers]);
  const showSpecialtyFilter = specialtyOptions.length >= 2;

  const visibleTeachers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teachers.filter((teacher) => {
      if (activeInstitution && teacher.institutionId !== activeInstitution) return false;
      if (
        selectedSpecialties.length > 0 &&
        !teacher.specialties.some((s) => selectedSpecialties.includes(s))
      )
        return false;
      if (q) {
        const haystack = [teacher.name, teacher.title, teacher.tagline, ...teacher.specialties]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [teachers, activeInstitution, selectedSpecialties, query]);

  const filtersActive = Boolean(activeInstitution || query.trim() || selectedSpecialties.length);

  function toggleSpecialty(value: string) {
    setSelectedSpecialties((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  }

  function clearFilters() {
    setActiveInstitution('');
    setQuery('');
    setSelectedSpecialties([]);
  }

  const subtitle =
    teachers.length > 0
      ? `${teachers.length} 位老师${institutionTabs.length > 1 ? ` · ${institutionTabs.length} 个课程提供方` : ''}，点击查看完整教师档案`
      : '认识我们的老师，找到适合孩子的那一位。';

  return (
    <Layout>
      <section className="container-narrow py-10">
        <div className="eyebrow">Teachers</div>
        <h1 className="section-title mt-2">教师团队</h1>
        <p className="text-ink-soft mt-2 text-sm">{subtitle}</p>

        {!loading && teachers.length > 0 && (
          <div className="mt-6 space-y-3">
            {showInstitutionFilter && (
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                <FilterPill
                  active={activeInstitution === ''}
                  onClick={() => setActiveInstitution('')}
                  count={teachers.length}
                >
                  全部
                </FilterPill>
                {institutionTabs.map((inst) => (
                  <FilterPill
                    key={inst.id}
                    active={activeInstitution === inst.id}
                    onClick={() => setActiveInstitution(inst.id)}
                    count={countByInstitution.get(inst.id) ?? 0}
                    title={inst.name}
                  >
                    <InstitutionMark institution={inst} />
                  </FilterPill>
                ))}
              </div>
            )}

            <div className="relative max-w-sm">
              <Search className="text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <input
                type="text"
                className="pwinput pl-9"
                placeholder="搜索老师姓名或擅长方向"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="搜索老师"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="清除搜索"
                  className="text-muted hover:text-ink absolute top-1/2 right-2.5 -translate-y-1/2"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {showSpecialtyFilter && (
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {specialtyOptions.map((specialty) => {
                  const on = selectedSpecialties.includes(specialty);
                  return (
                    <button
                      key={specialty}
                      type="button"
                      onClick={() => toggleSpecialty(specialty)}
                      aria-pressed={on}
                      className={specialtyChipClass(on)}
                    >
                      {specialty}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <TeacherCardSkeleton key={index} />
            ))}
          </div>
        ) : teachers.length === 0 ? (
          <TeachersEmptyState />
        ) : visibleTeachers.length === 0 ? (
          <NoResultsState onClear={clearFilters} />
        ) : (
          <>
            {filtersActive && (
              <div className="text-muted mt-6 text-sm">共 {visibleTeachers.length} 位老师</div>
            )}
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleTeachers.map((teacher) => (
                <TeacherCard key={teacher.id} teacher={teacher} />
              ))}
            </div>
          </>
        )}
      </section>
    </Layout>
  );
}

function FilterPill({
  active,
  onClick,
  count,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={[
        'focus-visible:ring-brand/30 inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm whitespace-nowrap transition outline-none focus-visible:ring-2',
        active
          ? 'border-brand bg-surface text-ink shadow-sm'
          : 'border-line bg-surface/70 text-ink-soft hover:border-brand/60 hover:text-ink',
      ].join(' ')}
    >
      {children}
      {typeof count === 'number' && (
        <span className={active ? 'text-brand text-xs font-semibold' : 'text-muted text-xs'}>
          {count}
        </span>
      )}
    </button>
  );
}

function specialtyChipClass(active: boolean) {
  return [
    'focus-visible:ring-brand/30 inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-medium whitespace-nowrap transition outline-none focus-visible:ring-2',
    active
      ? 'border-brand bg-brand text-white'
      : 'border-line bg-surface text-ink-soft hover:border-brand/60 hover:text-ink',
  ].join(' ');
}

function InstitutionMark({ institution }: { institution: PublicInstitution }) {
  if (institution.logoUrl) {
    return (
      <>
        <img
          src={institution.logoUrl}
          alt={institution.name}
          className="max-h-6 max-w-24 object-contain"
        />
        <span className="sr-only">{institution.name}</span>
      </>
    );
  }

  return <span className="truncate font-medium">{institution.name}</span>;
}

function TeacherCard({ teacher }: { teacher: PublicTeacher }) {
  const shownSpecialties = teacher.specialties.slice(0, 3);
  const stats = teacherStats(teacher).slice(0, 3);

  return (
    <Link
      to={`/teachers/${teacher.id}`}
      className="pwcard pwcard-hover group flex flex-col overflow-hidden no-underline"
    >
      <div className="bg-brand-soft relative aspect-[4/3] overflow-hidden">
        {teacher.avatarUrl ? (
          <img
            src={teacher.avatarUrl}
            alt={teacher.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="text-brand flex h-full w-full items-center justify-center">
            <GraduationCap className="h-12 w-12" />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h2 className="text-ink truncate text-lg font-semibold">{teacher.name}</h2>
        <div className="text-muted mt-0.5 min-h-5 truncate text-sm">{teacher.title || ' '}</div>

        <p className="text-ink-soft mt-3 line-clamp-2 min-h-[3rem] text-sm leading-6">
          {teacher.tagline?.trim() || '个人简介待补充'}
        </p>

        <div className="mt-3 flex min-h-7 flex-wrap gap-1.5">
          {shownSpecialties.map((item) => (
            <span key={item} className="chip">
              {item}
            </span>
          ))}
          {teacher.specialties.length > shownSpecialties.length ? (
            <span className="text-muted inline-flex items-center text-xs">
              +{teacher.specialties.length - shownSpecialties.length}
            </span>
          ) : null}
        </div>

        <div className="border-line text-muted mt-auto flex items-center gap-x-3 gap-y-1 border-t pt-4 text-xs">
          {stats.length ? (
            stats.map((item) => (
              <span key={item.label}>
                <b className="text-ink text-sm">{item.value}</b> {item.label}
              </span>
            ))
          ) : (
            <span>查看教师档案</span>
          )}
          <span className="text-ink group-hover:text-brand ml-auto inline-flex items-center gap-1 font-medium">
            详情
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function teacherStats(teacher: PublicTeacher) {
  return [
    { label: '教学', value: teacher.teachingYears },
    { label: '学员', value: teacher.studentCount },
    { label: '续班率', value: teacher.retentionRate },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value?.trim()));
}

function TeacherCardSkeleton() {
  return (
    <div className="pwcard overflow-hidden">
      <div className="skeleton aspect-[4/3] w-full rounded-none" />
      <div className="p-5">
        <div className="skeleton h-6 w-1/2" />
        <div className="skeleton mt-2 h-3.5 w-1/3" />
        <div className="skeleton mt-4 h-12 w-full" />
        <div className="mt-4 flex gap-2">
          <div className="skeleton h-6 w-14" />
          <div className="skeleton h-6 w-14" />
        </div>
        <div className="skeleton mt-5 h-4 w-full" />
      </div>
    </div>
  );
}

function NoResultsState({ onClear }: { onClear: () => void }) {
  return (
    <div className="pwcard mt-8 flex flex-col items-center px-6 py-16 text-center">
      <div className="bg-brand-soft text-brand flex h-12 w-12 items-center justify-center rounded-2xl">
        <Search className="h-6 w-6" />
      </div>
      <p className="text-ink mt-4 text-sm font-medium">没有匹配的老师</p>
      <p className="text-muted mt-1 text-sm">换个关键词或筛选条件试试。</p>
      <button type="button" onClick={onClear} className="pwbtn pwbtn-outline mt-5">
        清除筛选
      </button>
    </div>
  );
}

function TeachersEmptyState() {
  return (
    <div className="pwcard mt-8 flex flex-col items-center px-6 py-16 text-center">
      <div className="bg-brand-soft text-brand flex h-12 w-12 items-center justify-center rounded-2xl">
        <GraduationCap className="h-6 w-6" />
      </div>
      <p className="text-ink mt-4 text-sm font-medium">教师信息待上线</p>
      <p className="text-muted mt-1 text-sm">老师团队正在整理中，欢迎先预约试听。</p>
      <Link to="/register" className="pwbtn pwbtn-primary mt-5">
        预约试听
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
