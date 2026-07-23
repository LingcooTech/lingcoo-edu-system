import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, Clock3, MapPin, UsersRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { fetchPublicCheckIn, submitPublicCheckIn, type PublicCheckInPayload } from '@/api/client';
import { Layout } from '@/components/Layout';
import { useSeo } from '@/lib/seo';
import { formatDateTime } from '@/lib/utils';

export function CheckInPage() {
  const { sessionId = '' } = useParams();
  const [payload, setPayload] = useState<PublicCheckInPayload | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchPublicCheckIn(sessionId)
      .then((data) => {
        setPayload(data);
        setSelectedStudentId(data.roster.find((student) => !student.checkedIn)?.id ?? '');
      })
      .catch((err) => {
        setPayload(null);
        setError(err instanceof Error ? err.message : '签到链接无效');
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  const selectedStudent = useMemo(
    () => payload?.roster.find((student) => student.id === selectedStudentId) ?? null,
    [payload, selectedStudentId],
  );

  useSeo({
    title: payload?.session.topic ? `课堂签到：${payload.session.topic}` : '课堂签到',
    description: payload
      ? `${payload.class?.name ?? '临时课次'} · ${payload.course.name}`
      : undefined,
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedStudentId) {
      setError('请选择要签到的学员');
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const result = await submitPublicCheckIn(sessionId, selectedStudentId);
      setMessage(result.message);
      setPayload((current) =>
        current
          ? {
              ...current,
              roster: current.roster.map((student) =>
                student.id === selectedStudentId
                  ? { ...student, checkedIn: true, attendanceStatus: 'present' }
                  : student,
              ),
            }
          : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '签到失败，请联系老师处理');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="container-narrow text-muted py-12 text-sm">加载中...</div>
      </Layout>
    );
  }

  if (!payload) {
    return (
      <Layout>
        <div className="container-narrow py-12 text-center">
          <p className="text-ink-soft text-sm">{error || '签到链接无效。'}</p>
          <Link to="/" className="pwbtn pwbtn-outline mt-4">
            返回首页
          </Link>
        </div>
      </Layout>
    );
  }

  const checkedInCount = payload.roster.filter((student) => student.checkedIn).length;
  const allCheckedIn = payload.roster.length > 0 && checkedInCount === payload.roster.length;

  return (
    <Layout>
      <section className="container-narrow grid gap-6 py-8 lg:grid-cols-[1fr_420px]">
        <article className="pwcard p-6 md:p-8">
          <h1 className="text-ink text-3xl font-bold">{payload.session.topic}</h1>
          <p className="text-ink-soft mt-3 text-sm leading-7">
            {payload.class?.name ?? '临时课次'} · {payload.course.name}
          </p>
          <div className="text-ink-soft mt-6 grid gap-3 text-sm sm:grid-cols-3">
            <div className="bg-paper rounded-2xl p-4">
              <Clock3 className="text-brand mb-2 h-5 w-5" />
              {formatDateTime(payload.session.startsAt)}
            </div>
            <div className="bg-paper rounded-2xl p-4">
              <MapPin className="text-brand mb-2 h-5 w-5" />
              {payload.classroom?.name ?? '教室待确认'}
            </div>
            <div className="bg-paper rounded-2xl p-4">
              <UsersRound className="text-brand mb-2 h-5 w-5" />
              已签到 {checkedInCount}/{payload.roster.length}
            </div>
          </div>
        </article>

        <form className="pwcard h-fit space-y-4 p-5" onSubmit={submit}>
          <div>
            <h2 className="text-ink text-lg font-semibold">选择学员签到</h2>
            <p className="text-muted mt-1 text-xs">签到成功后系统会自动扣减 1 课时。</p>
          </div>

          <div className="space-y-2">
            {payload.roster.length === 0 ? (
              <div className="bg-paper text-muted rounded-2xl p-4 text-sm">当前班级暂无学员。</div>
            ) : (
              payload.roster.map((student) => (
                <label
                  key={student.id}
                  className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 ${
                    selectedStudentId === student.id
                      ? 'border-brand bg-brand-soft'
                      : 'border-line bg-surface'
                  }`}
                >
                  <span>
                    <span className="text-ink block text-sm font-semibold">{student.name}</span>
                    <span className="text-muted mt-1 block text-xs">{student.grade}</span>
                  </span>
                  {student.checkedIn ? (
                    <span className="text-brand inline-flex items-center gap-1 text-xs font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                      已签到
                    </span>
                  ) : (
                    <input
                      type="radio"
                      name="studentId"
                      value={student.id}
                      checked={selectedStudentId === student.id}
                      onChange={() => setSelectedStudentId(student.id)}
                    />
                  )}
                </label>
              ))
            )}
          </div>

          {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {message && (
            <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>
          )}
          <button
            type="submit"
            className="pwbtn pwbtn-primary w-full"
            disabled={submitting || !selectedStudent || selectedStudent.checkedIn || allCheckedIn}
          >
            {submitting ? '签到中...' : allCheckedIn ? '本课次已全部签到' : '确认签到'}
          </button>
        </form>
      </section>
    </Layout>
  );
}
