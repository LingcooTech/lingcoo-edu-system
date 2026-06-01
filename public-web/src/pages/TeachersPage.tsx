import { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';

import { fetchPublicTeachers, type PublicTeacher } from '@/api/client';
import { Layout } from '@/components/Layout';

export function TeachersPage() {
  const [teachers, setTeachers] = useState<PublicTeacher[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPublicTeachers()
      .then(setTeachers)
      .catch(() => setTeachers([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <section className="container-narrow py-10">
        <div className="eyebrow">Teachers</div>
        <h1 className="section-title mt-2">教师团队</h1>
        <p className="text-ink-soft mt-3 max-w-2xl text-sm leading-7">
          老师是教学交付的核心。这里展示在后台维护的教师资源，家长可以提前了解授课方向。
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {loading ? (
            <p className="text-muted text-sm">加载中…</p>
          ) : teachers.length ? (
            teachers.map((teacher) => (
              <article key={teacher.id} className="pwcard p-5">
                <div className="bg-brand-soft text-brand flex h-12 w-12 items-center justify-center rounded-2xl">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <h2 className="text-ink mt-4 text-lg font-semibold">{teacher.name}</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {teacher.specialties.length ? (
                    teacher.specialties.map((item) => <span key={item} className="chip">{item}</span>)
                  ) : (
                    <span className="text-muted text-sm">待补充擅长方向</span>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="text-muted text-sm">教师信息待上线。</p>
          )}
        </div>
      </section>
    </Layout>
  );
}
