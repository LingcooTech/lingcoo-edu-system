import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, MapPin, UsersRound } from 'lucide-react';

import {
  createSeatReservation,
  fetchTrialSession,
  fetchTrialSessions,
  submitTrialRegistration,
  type TrialDetail,
  type TrialSession,
} from '@/api/client';
import { CheckoutModal, type CheckoutTarget } from '@/components/CheckoutModal';
import { Layout } from '@/components/Layout';
import { getAttribution } from '@/lib/attribution';
import { useSeo } from '@/lib/seo';
import { formatDateTime, money } from '@/lib/utils';

const initialForm = {
  guardianName: '',
  phone: '',
  studentName: '',
  grade: '',
};

type TrialForm = typeof initialForm;

function readPrefillForm(state: unknown): Partial<TrialForm> {
  if (!state || typeof state !== 'object' || !('trialRegistration' in state)) {
    return {};
  }
  const value = (state as { trialRegistration?: unknown }).trialRegistration;
  if (!value || typeof value !== 'object') {
    return {};
  }
  const input = value as Record<string, unknown>;
  return {
    guardianName: typeof input.guardianName === 'string' ? input.guardianName : '',
    phone: typeof input.phone === 'string' ? input.phone : '',
    studentName: typeof input.studentName === 'string' ? input.studentName : '',
    grade: typeof input.grade === 'string' ? input.grade : '',
  };
}

function compareTrialSessionTime(a: TrialSession, b: TrialSession) {
  return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
}

function isSameTrialOption(session: TrialSession, current: TrialSession) {
  return (
    session.courseId === current.courseId &&
    session.campusId === current.campusId &&
    session.title === current.title
  );
}

function remainingSeats(session: TrialSession) {
  return Math.max(0, session.capacity - session.bookedCount);
}

function trialOptionLabel(session: TrialSession) {
  const remaining = remainingSeats(session);
  return `${formatDateTime(session.startsAt)} · ${remaining === 0 ? '已满' : `剩 ${remaining} 席`}`;
}

export function TrialDetailPage() {
  const { trialId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [detail, setDetail] = useState<TrialDetail | null>(null);
  const [sessionOptions, setSessionOptions] = useState<TrialSession[]>([]);
  const [form, setForm] = useState<TrialForm>(() => ({
    ...initialForm,
    ...readPrefillForm(location.state),
  }));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setCheckoutTarget(null);
    setCheckoutOpen(false);
    Promise.all([fetchTrialSession(trialId), fetchTrialSessions().catch(() => [])])
      .then(([payload, trialSessions]) => {
        if (cancelled) return;
        setDetail(payload);
        setSessionOptions(trialSessions);
      })
      .catch(() => {
        if (cancelled) return;
        setDetail(null);
        setSessionOptions([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [trialId]);

  useSeo({
    title: detail?.trialSession.title || '试听预约',
    description: detail?.course.summary,
    brandName: detail?.organization.brandName,
  });

  const trialSessionOptions = useMemo(() => {
    if (!detail) {
      return [];
    }
    const currentSession = detail.trialSession;
    const byId = new Map<string, TrialSession>();
    byId.set(currentSession.id, currentSession);
    for (const session of sessionOptions) {
      if (isSameTrialOption(session, currentSession)) {
        byId.set(session.id, session);
      }
    }
    return Array.from(byId.values()).sort(compareTrialSessionTime);
  }, [detail, sessionOptions]);

  function changeTrialTime(nextTrialSessionId: string) {
    if (!nextTrialSessionId || nextTrialSessionId === trialId) {
      return;
    }
    navigate(`/trials/${nextTrialSessionId}`, { state: { trialRegistration: form } });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    setSubmitting(true);
    setError('');
    try {
      const attribution = getAttribution();
      if (requiresReservationFee) {
        const payload = await createSeatReservation({
          ...form,
          trialSessionId: detail.trialSession.id,
          source: attribution.source ?? 'direct_trial',
          campaign: attribution.campaign,
          course: detail.course.slug,
          medium: attribution.medium ?? 'trial_qr',
        });
        setCheckoutTarget({
          type: 'order',
          orderNo: payload.order.orderNo,
          title: detail.trialSession.title,
          subtitle: `${detail.course.name} · ${formatDateTime(detail.trialSession.startsAt)}`,
          amount: detail.trialSession.reservationFeeAmount,
          successTitle: '席位已保留',
          successMessage: '支付成功后，本场试听名额已为孩子保留。',
          successActionLabel: '查看预约',
          successActionHref: '/account',
        });
        setCheckoutOpen(true);
      } else {
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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <TrialDetailSkeleton />
      </Layout>
    );
  }

  if (!detail) {
    return (
      <Layout>
        <div className="container-narrow py-16 text-center">
          <p className="text-ink-soft text-sm">试听课不存在或已关闭。</p>
          <Link to="/trials" className="pwbtn pwbtn-outline mt-4">
            查看全部试听
          </Link>
        </div>
      </Layout>
    );
  }

  const remaining = Math.max(0, detail.trialSession.capacity - detail.trialSession.bookedCount);
  const full = remaining === 0;
  const pct =
    detail.trialSession.capacity > 0
      ? Math.min(
          100,
          Math.round((detail.trialSession.bookedCount / detail.trialSession.capacity) * 100),
        )
      : 0;
  const requiresReservationFee =
    detail.organization.businessModel.seatReservationFeeEnabled &&
    detail.trialSession.reservationFeeAmount > 0;
  const coverImageUrl = detail.trialSession.coverImageUrl || detail.course.coverImageUrl;

  return (
    <Layout>
      <section className="container-narrow py-8">
        <Link to="/trials" className="text-muted hover:text-ink inline-flex items-center text-sm">
          <ChevronLeft className="h-4 w-4" />
          全部试听
        </Link>

        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_420px]">
          <article className="pwcard p-5 md:p-8">
            <h1 className="text-ink text-3xl font-bold tracking-tight">
              {detail.trialSession.title}
            </h1>
            <Link
              to={`/courses/${detail.course.slug}`}
              className="text-brand mt-2 inline-flex items-center text-sm font-medium hover:underline"
            >
              {detail.course.name}
            </Link>
            {coverImageUrl ? (
              <div className="bg-brand-soft mt-5 aspect-[16/9] overflow-hidden rounded-2xl">
                <img
                  src={coverImageUrl}
                  alt={detail.trialSession.title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}
            <p className="text-ink-soft mt-3 text-sm leading-7">{detail.course.summary}</p>

            <div className="text-ink-soft mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div className="bg-paper rounded-2xl p-4">
                <CalendarDays className="text-brand mb-2 h-5 w-5" />
                {trialSessionOptions.length > 1 ? (
                  <select
                    className="border-line bg-surface text-ink focus:border-brand focus:ring-brand/25 w-full rounded-xl border px-2.5 py-2 text-xs leading-5 outline-none focus:ring-2"
                    value={detail.trialSession.id}
                    onChange={(event) => changeTrialTime(event.target.value)}
                    aria-label="切换试听时间"
                  >
                    {trialSessionOptions.map((session) => {
                      const remaining = remainingSeats(session);
                      const full = remaining === 0;
                      return (
                        <option
                          key={session.id}
                          value={session.id}
                          disabled={full && session.id !== detail.trialSession.id}
                        >
                          {trialOptionLabel(session)}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  formatDateTime(detail.trialSession.startsAt)
                )}
              </div>
              <div className="bg-paper rounded-2xl p-4">
                <MapPin className="text-brand mb-2 h-5 w-5" />
                {detail.campus?.name ?? detail.organization.address ?? '校区待确认'}
              </div>
              <div className="bg-paper rounded-2xl p-4">
                <UsersRound className="text-brand mb-2 h-5 w-5" />
                已报名 {detail.trialSession.bookedCount}/{detail.trialSession.capacity}
              </div>
            </div>

            <div className="mt-4">
              <div className="bg-line h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className={full ? 'bg-muted h-full rounded-full' : 'bg-brand h-full rounded-full'}
                  style={{ width: `${full ? 100 : Math.max(pct, 4)}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="text-muted">名额</span>
                <span className={full ? 'text-muted' : 'text-brand font-medium'}>
                  {full ? '名额已满' : `剩 ${remaining} 席`}
                </span>
              </div>
            </div>

            {requiresReservationFee && (
              <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                本场需支付 {money(detail.trialSession.reservationFeeAmount)}
                试听席位保留费，支付成功后保留名额。
                {detail.trialSession.reservationNotice && (
                  <div className="mt-1 whitespace-pre-wrap">
                    {detail.trialSession.reservationNotice}
                  </div>
                )}
              </div>
            )}
          </article>

          <div className="mobile-form-card h-fit space-y-3 lg:sticky lg:top-24">
            {!checkoutTarget ? (
              <form className="space-y-3" onSubmit={submit}>
                <div>
                  <h2 className="text-ink text-lg font-semibold">
                    {requiresReservationFee ? '提交并保留试听席位' : '提交试听报名'}
                  </h2>
                  <p className="text-muted mt-1 text-xs">
                    {requiresReservationFee
                      ? '提交后支付席位保留费，支付成功后锁定名额。'
                      : '提交后自动生成预约试听阶段的线索。'}
                  </p>
                </div>
                <div>
                  <label className="pwlabel" htmlFor="trial-guardian">
                    家长姓名
                  </label>
                  <input
                    id="trial-guardian"
                    className="pwinput"
                    placeholder="请输入家长姓名"
                    value={form.guardianName}
                    onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="pwlabel" htmlFor="trial-phone">
                    手机号
                  </label>
                  <input
                    id="trial-phone"
                    className="pwinput"
                    placeholder="用于老师联系确认"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="pwlabel" htmlFor="trial-student">
                    孩子姓名
                  </label>
                  <input
                    id="trial-student"
                    className="pwinput"
                    placeholder="请输入孩子姓名"
                    value={form.studentName}
                    onChange={(e) => setForm({ ...form, studentName: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="pwlabel" htmlFor="trial-grade">
                    年级 / 年龄
                  </label>
                  <input
                    id="trial-grade"
                    className="pwinput"
                    placeholder="如：二年级 / 7 岁"
                    value={form.grade}
                    onChange={(e) => setForm({ ...form, grade: e.target.value })}
                    required
                  />
                </div>
                {error && (
                  <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
                )}
                <button
                  type="submit"
                  className="pwbtn pwbtn-primary w-full"
                  disabled={submitting || full}
                >
                  {full
                    ? '名额已满'
                    : submitting
                      ? '提交中...'
                      : requiresReservationFee
                        ? `支付 ${money(detail.trialSession.reservationFeeAmount)} 保留名额`
                        : '预约这节试听课'}
                </button>
                <p className="text-muted text-center text-xs">免注册 · 信息仅用于本次试听联系</p>
              </form>
            ) : (
              <div className="space-y-3">
                <div>
                  <h2 className="text-ink text-lg font-semibold">试听席位保留费待支付</h2>
                  <p className="text-muted mt-1 text-xs">
                    订单 {checkoutTarget.type === 'order' ? checkoutTarget.orderNo : '-'}
                  </p>
                </div>
                {error && (
                  <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
                )}
                <button
                  type="button"
                  className="pwbtn pwbtn-primary w-full"
                  onClick={() => setCheckoutOpen(true)}
                >
                  继续支付保留名额
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
      <CheckoutModal
        open={checkoutOpen}
        target={checkoutTarget}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={() => navigate('/register/success')}
      />
    </Layout>
  );
}

function TrialDetailSkeleton() {
  return (
    <section className="container-narrow py-8">
      <div className="skeleton h-4 w-20" />
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="pwcard p-6 md:p-8">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton mt-3 h-9 w-2/3" />
          <div className="skeleton mt-3 h-4 w-full" />
          <div className="skeleton mt-2 h-4 w-4/5" />
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="skeleton h-20" />
            <div className="skeleton h-20" />
            <div className="skeleton h-20" />
          </div>
        </div>
        <div className="pwcard h-fit space-y-3 p-5">
          <div className="skeleton h-6 w-32" />
          <div className="skeleton h-11 w-full" />
          <div className="skeleton h-11 w-full" />
          <div className="skeleton h-11 w-full" />
          <div className="skeleton h-11 w-full" />
          <div className="skeleton h-12 w-full" />
        </div>
      </div>
    </section>
  );
}
