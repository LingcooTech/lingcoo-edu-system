import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, GraduationCap } from 'lucide-react';

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

  const subtitle =
    teachers.length > 0
      ? `${teachers.length} 位老师，点击查看完整教师档案`
      : '认识我们的老师，找到适合孩子的那一位。';

  return (
    <Layout>
      <section className="container-narrow py-10">
        <div className="eyebrow">Teachers</div>
        <h1 className="section-title mt-2">教师团队</h1>
        <p className="text-ink-soft mt-2 text-sm">{subtitle}</p>

        {loading ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <TeacherCardSkeleton key={index} />
            ))}
          </div>
        ) : teachers.length === 0 ? (
          <TeachersEmptyState />
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {teachers.map((teacher) => (
              <TeacherCard key={teacher.id} teacher={teacher} />
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}

function TeacherCard({ teacher }: { teacher: PublicTeacher }) {
  const stats = teacherStats(teacher).slice(0, 3);
  const direction = teacher.specialties[0];
  // Static class strings so Tailwind's JIT picks them up.
  const statColsClass = ['grid-cols-1', 'grid-cols-2', 'grid-cols-3'][Math.max(stats.length - 1, 0)];

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
        {direction ? (
          <span className="text-brand absolute bottom-2.5 left-2.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur">
            {direction}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-ink truncate text-lg font-semibold">{teacher.name}</h2>
          <ArrowRight className="text-muted group-hover:text-brand h-4 w-4 shrink-0 transition group-hover:translate-x-0.5" />
        </div>
        <div className="text-muted mt-1 truncate text-sm">{teacher.title || ' '}</div>

        <p className="text-ink-soft mt-3 line-clamp-2 min-h-12 text-sm leading-6">
          {teacher.tagline?.trim() || '个人简介待补充'}
        </p>

        {stats.length ? (
          <div className={`border-line mt-auto grid ${statColsClass} border-t pt-3.5`}>
            {stats.map((item) => (
              <div key={item.label} className="text-center">
                <b className="text-ink block text-base font-semibold">{item.value}</b>
                <span className="text-muted mt-0.5 block text-[11px] whitespace-nowrap">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-line text-muted mt-auto border-t pt-3.5 text-center text-xs">
            查看教师档案
          </div>
        )}
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
      <div className="p-4">
        <div className="skeleton h-6 w-1/2" />
        <div className="skeleton mt-2 h-3.5 w-2/3" />
        <div className="skeleton mt-3 h-12 w-full" />
        <div className="border-line mt-4 grid grid-cols-3 gap-2 border-t pt-3.5">
          <div className="skeleton h-9" />
          <div className="skeleton h-9" />
          <div className="skeleton h-9" />
        </div>
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
