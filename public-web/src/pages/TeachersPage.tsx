import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, GraduationCap } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<string>('');
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

  // Keep the institution order from the backend list; only omit empty groups.
  const tabs = useMemo(
    () => institutions.filter((inst) => teachers.some((t) => t.institutionId === inst.id)),
    [institutions, teachers],
  );

  useEffect(() => {
    if (tabs.length === 0) {
      if (activeTab) setActiveTab('');
      return;
    }
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [activeTab, tabs]);

  const institutionById = useMemo(
    () => new Map(institutions.map((institution) => [institution.id, institution])),
    [institutions],
  );

  const visibleTeachers = useMemo(
    () =>
      tabs.length === 0
        ? teachers
        : teachers.filter((teacher) => teacher.institutionId === (activeTab || tabs[0]?.id)),
    [teachers, activeTab, tabs],
  );

  function tabClassName(active: boolean) {
    return [
      'inline-flex h-11 max-w-44 items-center justify-center rounded-full border px-4 text-sm transition outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
      active
        ? 'border-brand bg-surface text-ink shadow-sm'
        : 'border-line bg-surface/70 text-ink-soft hover:border-brand/60 hover:text-ink',
    ].join(' ');
  }

  return (
    <Layout>
      <section className="container-narrow py-10">
        <div className="eyebrow">Teachers</div>
        <h1 className="section-title mt-2">教师团队</h1>

        {tabs.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {tabs.map((inst) => (
              <button
                key={inst.id}
                type="button"
                className={tabClassName(activeTab === inst.id)}
                title={inst.name}
                onClick={() => setActiveTab(inst.id)}
              >
                <InstitutionMark institution={inst} />
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <TeacherCardSkeleton key={index} />
            ))}
          </div>
        ) : visibleTeachers.length ? (
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {visibleTeachers.map((teacher) => (
              <TeacherCard
                key={teacher.id}
                teacher={teacher}
                institution={
                  teacher.institutionId ? institutionById.get(teacher.institutionId) : undefined
                }
              />
            ))}
          </div>
        ) : (
          <TeachersEmptyState />
        )}
      </section>
    </Layout>
  );
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

function TeacherCard({
  teacher,
  institution,
}: {
  teacher: PublicTeacher;
  institution?: PublicInstitution;
}) {
  const shownSpecialties = teacher.specialties.slice(0, 3);

  return (
    <Link
      to={`/teachers/${teacher.id}`}
      className="pwcard group relative block overflow-hidden p-5 no-underline transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="from-ink to-brand absolute inset-x-0 top-0 h-1 bg-gradient-to-r" />
      <div className="flex items-start gap-4">
        {teacher.avatarUrl ? (
          <img
            src={teacher.avatarUrl}
            alt={teacher.name}
            className="border-line h-20 w-20 shrink-0 rounded-2xl border object-cover"
          />
        ) : (
          <div className="bg-brand-soft text-brand flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl">
            <GraduationCap className="h-8 w-8" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {institution ? (
            institution.logoUrl ? (
              <div className="mb-2 flex h-6 max-w-28 items-center">
                <InstitutionMark institution={institution} />
              </div>
            ) : (
              <div className="chip mb-2 max-w-full">
                <InstitutionMark institution={institution} />
              </div>
            )
          ) : null}
          <h2 className="text-ink truncate text-xl font-semibold">{teacher.name}</h2>
          {teacher.title ? (
            <div className="text-muted mt-1 truncate text-xs">{teacher.title}</div>
          ) : null}
        </div>
      </div>

      {teacher.tagline ? (
        <p className="text-ink-soft mt-4 line-clamp-2 min-h-12 text-sm leading-6">
          {teacher.tagline}
        </p>
      ) : (
        <p className="text-muted mt-4 min-h-12 text-sm leading-6">个人简介待补充</p>
      )}

      <div className="mt-4 flex min-h-8 flex-wrap gap-2">
        {shownSpecialties.length ? (
          <>
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
          </>
        ) : (
          <span className="text-muted text-sm">擅长方向待补充</span>
        )}
      </div>

      <div className="text-ink-soft group-hover:text-ink mt-5 inline-flex items-center gap-1 text-sm font-medium">
        查看详情
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function TeacherCardSkeleton() {
  return (
    <div className="pwcard p-5">
      <div className="flex items-start gap-4">
        <div className="skeleton h-20 w-20 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="skeleton h-5 w-20" />
          <div className="skeleton mt-3 h-6 w-2/3" />
          <div className="skeleton mt-2 h-3.5 w-1/2" />
        </div>
      </div>
      <div className="skeleton mt-4 h-12 w-full" />
      <div className="mt-4 flex gap-2">
        <div className="skeleton h-6 w-14" />
        <div className="skeleton h-6 w-14" />
      </div>
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
