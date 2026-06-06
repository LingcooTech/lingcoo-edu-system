import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';

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

  const visibleTeachers = useMemo(
    () =>
      activeTab === ALL_TAB
        ? teachers
        : teachers.filter((teacher) => teacher.institutionId === activeTab),
    [teachers, activeTab],
  );

  function tabClassName(active: boolean) {
    return [
      'rounded-full border px-4 py-1.5 text-sm transition',
      active
        ? 'border-brand/30 bg-brand-soft text-brand font-medium'
        : 'border-line text-ink-soft hover:text-ink',
    ].join(' ');
  }

  return (
    <Layout>
      <section className="container-narrow py-10">
        <div className="eyebrow">Teachers</div>
        <h1 className="section-title mt-2">教师团队</h1>
        <p className="text-ink-soft mt-3 max-w-2xl text-sm leading-7">
          老师是教学交付的核心。这里展示在后台维护的教师资源，家长可以提前了解授课方向，点击老师查看详情。
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
                onClick={() => setActiveTab(inst.id)}
              >
                {inst.name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {loading ? (
            <p className="text-muted text-sm">加载中…</p>
          ) : visibleTeachers.length ? (
            visibleTeachers.map((teacher) => (
              <Link
                key={teacher.id}
                to={`/teachers/${teacher.id}`}
                className="pwcard block p-5 no-underline transition hover:shadow-md"
              >
                {teacher.avatarUrl ? (
                  <img
                    src={teacher.avatarUrl}
                    alt={teacher.name}
                    className="border-line h-14 w-14 rounded-2xl border object-cover"
                  />
                ) : (
                  <div className="bg-brand-soft text-brand flex h-12 w-12 items-center justify-center rounded-2xl">
                    <GraduationCap className="h-6 w-6" />
                  </div>
                )}
                <h2 className="text-ink mt-4 text-lg font-semibold">{teacher.name}</h2>
                {teacher.title ? (
                  <div className="text-muted mt-0.5 text-xs">{teacher.title}</div>
                ) : null}
                {teacher.tagline ? (
                  <p className="text-ink-soft mt-2 line-clamp-2 text-sm leading-6">
                    {teacher.tagline}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {teacher.specialties.length ? (
                    teacher.specialties.map((item) => (
                      <span key={item} className="chip">
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted text-sm">待补充擅长方向</span>
                  )}
                </div>
              </Link>
            ))
          ) : (
            <p className="text-muted text-sm">教师信息待上线。</p>
          )}
        </div>
      </section>
    </Layout>
  );
}
