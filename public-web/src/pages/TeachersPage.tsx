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

const ALL_TAB = 'all';

export function TeachersPage() {
  const [teachers, setTeachers] = useState<PublicTeacher[]>([]);
  const [institutions, setInstitutions] = useState<PublicInstitution[]>([]);
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);
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

  // Only show tabs for institutions that actually have at least one teacher;
  // teachers without an institution stay visible under「全部」.
  const tabs = useMemo(
    () => institutions.filter((inst) => teachers.some((t) => t.institutionId === inst.id)),
    [institutions, teachers],
  );

  const institutionById = useMemo(
    () => new Map(institutions.map((institution) => [institution.id, institution])),
    [institutions],
  );

  const visibleTeachers = useMemo(
    () =>
      activeTab === ALL_TAB
        ? teachers
        : teachers.filter((teacher) => teacher.institutionId === activeTab),
    [teachers, activeTab],
  );

  function tabClassName(active: boolean) {
    return [
      'inline-flex h-11 max-w-44 items-center justify-center rounded-full border px-4 text-sm transition',
      active
        ? 'border-[#c9a76d] bg-white text-[#17324d] shadow-sm'
        : 'border-line bg-surface/70 text-ink-soft hover:border-[#c9a76d]/70 hover:text-ink',
    ].join(' ');
  }

  return (
    <Layout>
      <section className="container-narrow py-10">
        <div className="eyebrow">Teachers</div>
        <h1 className="section-title mt-2">教师团队</h1>
        <p className="text-ink-soft mt-3 max-w-2xl text-sm leading-7">
          从教师背景、教学风格到擅长方向，帮助家长更快判断课程匹配。
        </p>

        {tabs.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              className={tabClassName(activeTab === ALL_TAB)}
              onClick={() => setActiveTab(ALL_TAB)}
            >
              全部
            </button>
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

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {loading ? (
            <p className="text-muted text-sm">加载中…</p>
          ) : visibleTeachers.length ? (
            visibleTeachers.map((teacher) => (
              <TeacherCard
                key={teacher.id}
                teacher={teacher}
                institution={
                  teacher.institutionId ? institutionById.get(teacher.institutionId) : undefined
                }
              />
            ))
          ) : (
            <p className="text-muted text-sm">教师信息待上线。</p>
          )}
        </div>
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
          className="max-h-7 max-w-28 object-contain"
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
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#17324d,#c9a76d)]" />
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
            <div className="mb-2 inline-flex max-w-full items-center rounded-full border border-[#d8c39a]/70 bg-[#fbf7ec] px-2.5 py-1 text-xs text-[#17324d]">
              <InstitutionMark institution={institution} />
            </div>
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
