import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, MapPin, UsersRound } from 'lucide-react';

import {
  fetchTrialSession,
  submitTrialRegistration,
  type TrialDetail,
} from '@/api/client';
import { Layout } from '@/components/Layout';
import { getAttribution } from '@/lib/attribution';
import { formatDateTime } from '@/lib/utils';

const initialForm = {
  guardianName: '',
  phone: '',
  studentName: '',
  grade: '',
};

export function TrialDetailPage() {
  const { trialId = '' } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<TrialDetail | null>(null);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchTrialSession(trialId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [trialId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    setSubmitting(true);
    setError('');
    try {
      const attribution = getAttribution();
      await submitTrialRegistration({
        ...form,
        trialSessionId: detail.trialSession.id,
        courseId: detail.course.id,
        source: attribution.source ?? 'direct_trial',
        campaign: attribution.campaign,
        course: detail.course.slug,
        medium: attribution.medium ?? 'trial_qr',
      });
      navigate('/register/success');
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'border-line w-full rounded-xl border bg-surface px-3.5 py-3 text-sm';

  if (loading) {
    return (
      <Layout>
        <div className="container-narrow py-12 text-sm text-muted">加载中…</div>
      </Layout>
    );
  }

  if (!detail) {
    return (
      <Layout>
        <div className="container-narrow py-12 text-center">
          <p className="text-ink-soft text-sm">试听课不存在或已关闭。</p>
          <Link to="/trials" className="pwbtn pwbtn-outline mt-4">
            查看全部试听
          </Link>
        </div>
      </Layout>
    );
  }

  const full = detail.trialSession.bookedCount >= detail.trialSession.capacity;

  return (
    <Layout>
      <section className="container-narrow grid gap-6 py-8 lg:grid-cols-[1fr_420px]">
        <article className="pwcard p-6 md:p-8">
          <div className="eyebrow">Trial Booking</div>
          <h1 className="text-ink mt-2 text-3xl font-bold">{detail.trialSession.title}</h1>
          <p className="text-ink-soft mt-3 text-sm leading-7">{detail.course.summary}</p>
          <div className="mt-6 grid gap-3 text-sm text-ink-soft sm:grid-cols-3">
            <div className="rounded-2xl bg-paper p-4">
              <CalendarDays className="mb-2 h-5 w-5 text-brand" />
              {formatDateTime(detail.trialSession.startsAt)}
            </div>
            <div className="rounded-2xl bg-paper p-4">
              <MapPin className="mb-2 h-5 w-5 text-brand" />
              {detail.campus?.name ?? detail.organization.address ?? '校区待确认'}
            </div>
            <div className="rounded-2xl bg-paper p-4">
              <UsersRound className="mb-2 h-5 w-5 text-brand" />
              已报名 {detail.trialSession.bookedCount}/{detail.trialSession.capacity}
            </div>
          </div>
        </article>

        <form className="pwcard h-fit space-y-3 p-5" onSubmit={submit}>
          <div>
            <h2 className="text-ink text-lg font-semibold">提交试听报名</h2>
            <p className="text-muted mt-1 text-xs">提交后自动生成预约试听阶段的线索。</p>
          </div>
          <input className={inputClass} placeholder="家长姓名" value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} required />
          <input className={inputClass} placeholder="手机号" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          <input className={inputClass} placeholder="孩子姓名" value={form.studentName} onChange={(e) => setForm({ ...form, studentName: e.target.value })} required />
          <input className={inputClass} placeholder="年级 / 年龄" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} required />
          {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <button type="submit" className="pwbtn pwbtn-primary w-full" disabled={submitting || full}>
            {full ? '名额已满' : submitting ? '提交中...' : '预约这节试听课'}
          </button>
        </form>
      </section>
    </Layout>
  );
}
