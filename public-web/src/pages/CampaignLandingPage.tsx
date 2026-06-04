import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  fetchCampaignLanding,
  submitCampaignParticipation,
  type CampaignLandingPayload,
} from '@/api/client';
import { BlockRenderer } from '@/components/blocks/BlockRenderer';
import { parseBlocks } from '@/components/blocks/blocks';
import { Layout } from '@/components/Layout';
import { formatDateTime } from '@/lib/utils';

const initialForm = {
  guardianName: '',
  phone: '',
  studentName: '',
  grade: '',
  trialSessionId: '',
};

export function CampaignLandingPage() {
  const { campaignCode = '' } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<CampaignLandingPayload | null>(null);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchCampaignLanding(campaignCode)
      .then((data) => {
        setPayload(data);
        setForm((prev) => ({ ...prev, trialSessionId: data.trialSessions[0]?.id ?? '' }));
      })
      .catch(() => setPayload(null))
      .finally(() => setLoading(false));
  }, [campaignCode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!payload) return;
    setSubmitting(true);
    setError('');
    try {
      await submitCampaignParticipation(payload.campaign.code, {
        guardianName: form.guardianName,
        phone: form.phone,
        studentName: form.studentName,
        grade: form.grade,
        trialSessionId: form.trialSessionId || undefined,
        courseId: payload.course?.id,
        source: payload.channel?.code ?? 'campaign',
        medium: payload.campaign.medium,
      });
      navigate('/register/success');
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'border-line w-full rounded-xl border bg-surface px-3.5 py-3 text-sm';

  const contentBlocks = useMemo(() => parseBlocks(payload?.campaign.content), [payload]);

  if (loading) {
    return (
      <Layout>
        <div className="container-narrow py-12 text-sm text-muted">加载中…</div>
      </Layout>
    );
  }

  if (!payload) {
    return (
      <Layout>
        <div className="container-narrow py-12 text-center">
          <p className="text-ink-soft text-sm">活动不存在或已结束。</p>
          <Link to="/" className="pwbtn pwbtn-outline mt-4">返回首页</Link>
        </div>
      </Layout>
    );
  }

  const profile = payload.organization.publicProfile;

  return (
    <Layout>
      <section className="border-line bg-surface border-b">
        <div className="container-narrow hero-grid">
          <div>
            <div className="eyebrow">{payload.channel?.name ?? '招生活动'}</div>
            <h1 className="text-ink mt-4 text-4xl leading-tight font-bold tracking-tight">
              {payload.campaign.name}
            </h1>
            <p className="text-ink-soft mt-5 text-base leading-8">
              {payload.course
                ? `${payload.course.name} · ${payload.course.summary}`
                : profile.bannerSubtitle}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {(payload.course ? [payload.course.category, payload.course.ageRange] : profile.highlights).map((item) => (
                <span key={item} className="chip">{item}</span>
              ))}
            </div>
          </div>
          <div className="hero-media">
            <img src={profile.bannerImageUrl} alt={payload.campaign.name} className="h-full w-full object-cover" />
          </div>
        </div>
      </section>

      <section className="container-narrow grid gap-6 py-8 lg:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          {contentBlocks.length > 0 && (
            <div className="pwcard p-5">
              <BlockRenderer blocks={contentBlocks} />
            </div>
          )}
          <div className="pwcard p-5">
            <h2 className="text-ink text-lg font-semibold">可预约试听</h2>
            <div className="mt-3 grid gap-3">
              {payload.trialSessions.length ? (
                payload.trialSessions.map((session) => (
                  <label key={session.id} className="flex cursor-pointer items-center justify-between rounded-2xl border border-line p-4">
                    <span>
                      <span className="block text-sm font-semibold text-ink">{session.title}</span>
                      <span className="mt-1 block text-xs text-muted">{formatDateTime(session.startsAt)} · {session.bookedCount}/{session.capacity}</span>
                    </span>
                    <input
                      type="radio"
                      name="trialSessionId"
                      value={session.id}
                      checked={form.trialSessionId === session.id}
                      onChange={(event) => setForm({ ...form, trialSessionId: event.target.value })}
                    />
                  </label>
                ))
              ) : (
                <p className="text-muted text-sm">当前活动不绑定固定试听课，提交后老师会电话确认合适时间。</p>
              )}
            </div>
          </div>
        </div>

        <form className="pwcard h-fit space-y-3 p-5" onSubmit={submit}>
          <div>
            <h2 className="text-ink text-lg font-semibold">提交报名</h2>
            <p className="text-muted mt-1 text-xs">
              {form.trialSessionId ? '提交后进入预约试听阶段。' : '提交后进入待联系阶段。'}
            </p>
          </div>
          <input className={inputClass} placeholder="家长姓名" value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} required />
          <input className={inputClass} placeholder="手机号" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          <input className={inputClass} placeholder="孩子姓名" value={form.studentName} onChange={(e) => setForm({ ...form, studentName: e.target.value })} required />
          <input className={inputClass} placeholder="年级 / 年龄" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} required />
          {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <button type="submit" className="pwbtn pwbtn-primary w-full" disabled={submitting}>
            {submitting ? '提交中...' : '立即预约'}
          </button>
        </form>
      </section>
    </Layout>
  );
}
