import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, MapPin, UsersRound } from 'lucide-react';

import {
  createSeatReservation,
  fetchTrialSession,
  submitTrialRegistration,
  type TrialDetail,
} from '@/api/client';
import { CheckoutModal, type CheckoutTarget } from '@/components/CheckoutModal';
import { Layout } from '@/components/Layout';
import { getAttribution } from '@/lib/attribution';
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

export function TrialDetailPage() {
  const { trialId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [detail, setDetail] = useState<TrialDetail | null>(null);
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

  const inputClass = 'border-line w-full rounded-xl border bg-surface px-3.5 py-3 text-sm';

  if (loading) {
    return (
      <Layout>
        <div className="container-narrow text-muted py-12 text-sm">加载中…</div>
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
  const requiresReservationFee =
    detail.organization.businessModel.seatReservationFeeEnabled &&
    detail.trialSession.reservationFeeAmount > 0;

  return (
    <Layout>
      <section className="container-narrow grid gap-6 py-8 lg:grid-cols-[1fr_420px]">
        <article className="pwcard p-6 md:p-8">
          <div className="eyebrow">Trial Booking</div>
          <h1 className="text-ink mt-2 text-3xl font-bold">{detail.trialSession.title}</h1>
          <p className="text-ink-soft mt-3 text-sm leading-7">{detail.course.summary}</p>
          <div className="text-ink-soft mt-6 grid gap-3 text-sm sm:grid-cols-3">
            <div className="bg-paper rounded-2xl p-4">
              <CalendarDays className="text-brand mb-2 h-5 w-5" />
              {formatDateTime(detail.trialSession.startsAt)}
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

        <div className="pwcard h-fit space-y-3 p-5">
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
              <input
                className={inputClass}
                placeholder="家长姓名"
                value={form.guardianName}
                onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
                required
              />
              <input
                className={inputClass}
                placeholder="手机号"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
              />
              <input
                className={inputClass}
                placeholder="孩子姓名"
                value={form.studentName}
                onChange={(e) => setForm({ ...form, studentName: e.target.value })}
                required
              />
              <input
                className={inputClass}
                placeholder="年级 / 年龄"
                value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
                required
              />
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
