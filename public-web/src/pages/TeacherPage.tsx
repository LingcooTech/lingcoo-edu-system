import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, LogOut, UsersRound } from 'lucide-react';

import {
  fetchParentProfile,
  fetchTeacherDashboard,
  getParentToken,
  type TeacherClass,
  type TeacherClassSession,
} from '@/api/client';
import { Layout } from '@/components/Layout';
import { useSession } from '@/features/session';
import { formatDateTime } from '@/lib/utils';

const SESSION_STATUS_LABEL: Record<string, string> = {
  scheduled: '已排课',
  completed: '已完成',
  cancelled: '已取消',
};

export function TeacherPage() {
  const navigate = useNavigate();
  const { logout: logoutSession } = useSession();
  const [sessions, setSessions] = useState<TeacherClassSession[]>([]);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getParentToken()) {
      navigate('/login?redirect=/teacher');
      return;
    }
    Promise.all([fetchParentProfile(), fetchTeacherDashboard()])
      .then(([profile, dashboard]) => {
        if (!profile) {
          navigate('/login?redirect=/teacher');
          return;
        }
        if (profile.mustChangePassword) {
          navigate('/change-password');
          return;
        }
        if (profile.role !== 'teacher') {
          if (profile.role === 'admin') {
            window.location.href = '/admin';
          } else {
            navigate('/account');
          }
          return;
        }
        setSessions(dashboard.sessions);
        setClasses(dashboard.classes);
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  async function logout() {
    await logoutSession();
    navigate('/');
  }

  if (loading) {
    return (
      <Layout>
        <main className="px-5 py-16 text-center text-sm text-slate-500">加载中...</main>
      </Layout>
    );
  }

  return (
    <Layout>
      <main className="mx-auto max-w-4xl px-5 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">老师工作台</h1>
            <p className="mt-1 text-sm text-slate-500">查看我的课表、班级和学员名单。</p>
          </div>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm text-slate-600"
          >
            <LogOut className="h-4 w-4" />
            退出
          </button>
        </div>

        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <CalendarDays className="h-4 w-4 text-blue-600" />
            我的课表
          </div>
          {sessions.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-slate-500">暂无排课。</div>
          ) : (
            <div className="grid gap-2">
              {sessions.map((session) => (
                <div key={session.id} className="rounded-2xl border bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">
                        {session.class?.name ?? '班级'} · {session.topic}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {session.course?.name ?? '课程'} · {session.classroom?.name ?? '教室'}
                      </div>
                    </div>
                    <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                      {SESSION_STATUS_LABEL[session.status] ?? session.status}
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-slate-700">
                    {formatDateTime(session.startsAt)} - {formatDateTime(session.endsAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <UsersRound className="h-4 w-4 text-blue-600" />
            我的班级
          </div>
          {classes.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-slate-500">暂无班级。</div>
          ) : (
            <div className="grid gap-3">
              {classes.map((item) => (
                <div key={item.id} className="rounded-2xl border bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{item.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.course?.name ?? '课程'} · {item.classroom?.name ?? '教室'} ·{' '}
                        {item.students.length}/{item.capacity}
                      </div>
                    </div>
                    <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                      {item.status}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.students.map((student) => (
                      <span key={student.id} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                        {student.name} · {student.grade}
                      </span>
                    ))}
                    {item.students.length === 0 && (
                      <span className="text-xs text-slate-400">暂无学员</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </Layout>
  );
}
