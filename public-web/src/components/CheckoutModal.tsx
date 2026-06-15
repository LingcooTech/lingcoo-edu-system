import { useEffect, useRef, useState } from 'react';
import type { FormEvent, MutableRefObject } from 'react';
import { Check, ExternalLink, Loader2, RefreshCw } from 'lucide-react';

import {
  createOrder,
  createPaymentIntent,
  fetchPaymentProviders,
  mockPayOrder,
  syncPayment,
  type CheckoutInfo,
  type ParentOrder,
  type PaymentIntent,
  type PaymentProvider,
  type PaymentProviderStatus,
} from '@/api/client';
import { getAttribution } from '@/lib/attribution';
import { money } from '@/lib/utils';

import { Modal } from './Modal';

type CheckoutStep = 'form' | 'payment' | 'done';

export type CheckoutTarget =
  | {
      type: 'package';
      packageId: string;
      courseId?: string;
      title: string;
      subtitle: string;
      description?: string;
      amount: number;
      lessonCount: number;
    }
  | {
      type: 'order';
      orderNo: string;
      title: string;
      subtitle: string;
      amount: number;
      successTitle: string;
      successMessage: string;
      successActionLabel?: string;
      successActionHref?: string;
    };

const PROVIDER_LABEL: Record<PaymentProvider, string> = {
  wechat_pay: '微信支付',
  alipay: '支付宝',
  mock: '模拟支付（开发）',
};

const DEFAULT_PROVIDERS: PaymentProviderStatus[] = [
  { code: 'wechat_pay', label: '微信支付', configured: false, supportedModes: ['native_qr'] },
  { code: 'alipay', label: '支付宝', configured: false, supportedModes: ['page_redirect'] },
];

if (import.meta.env.DEV) {
  DEFAULT_PROVIDERS.push({
    code: 'mock',
    label: '模拟支付（开发）',
    configured: true,
    supportedModes: ['mock_mini_program'],
  });
}

function clearTimer(ref: MutableRefObject<ReturnType<typeof setInterval> | null>) {
  if (ref.current) {
    clearInterval(ref.current);
    ref.current = null;
  }
}

function providerDisplayLabel(provider: PaymentProviderStatus) {
  return provider.label || PROVIDER_LABEL[provider.code] || provider.code;
}

export function CheckoutModal({
  open,
  target,
  onClose,
  onSuccess,
}: {
  open: boolean;
  target: CheckoutTarget | null;
  onClose: () => void;
  onSuccess?: (order: ParentOrder, checkout?: CheckoutInfo | null) => void;
}) {
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [studentName, setStudentName] = useState('');
  const [grade, setGrade] = useState('');
  const [step, setStep] = useState<CheckoutStep>('form');
  const [providers, setProviders] = useState<PaymentProviderStatus[]>(DEFAULT_PROVIDERS);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [orderNo, setOrderNo] = useState('');
  const [checkout, setCheckout] = useState<CheckoutInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [paymentHint, setPaymentHint] = useState('');
  const [redirectOpened, setRedirectOpened] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open || !target) {
      clearTimer(pollRef);
      return;
    }

    setGuardianName('');
    setGuardianPhone('');
    setStudentName('');
    setGrade('');
    setIntent(null);
    setCheckout(null);
    setError('');
    setPaymentHint('');
    setBusy(false);
    setSyncing(false);
    setRedirectOpened(false);
    setOrderNo(target.type === 'order' ? target.orderNo : '');
    setStep(target.type === 'order' ? 'payment' : 'form');

    fetchPaymentProviders()
      .then(setProviders)
      .catch(() => setProviders(DEFAULT_PROVIDERS));

    return () => {
      clearTimer(pollRef);
    };
  }, [open, target]);

  function markPaid(order: ParentOrder, checkoutInfo = checkout) {
    clearTimer(pollRef);
    setError('');
    setPaymentHint('');
    setStep('done');
    onSuccess?.(order, checkoutInfo);
  }

  async function reconcilePayment(no: string, options: { showPendingHint?: boolean } = {}) {
    const result = await syncPayment(no);
    if (result.item.status === 'paid') {
      markPaid(result.item);
      return true;
    }

    if (options.showPendingHint) {
      setPaymentHint(result.reconciliation.reason || '支付还未完成，扫码付款后稍候片刻。');
    }
    return false;
  }

  function startPolling(no: string) {
    clearTimer(pollRef);
    const tick = async () => {
      try {
        await reconcilePayment(no);
      } catch {
        // Keep polling through short network hiccups; the manual sync button
        // below lets the user reconcile explicitly after completing payment.
      }
    };
    void tick();
    pollRef.current = setInterval(() => void tick(), 3000);
  }

  async function ensureOrder() {
    if (!target) {
      throw new Error('未选择支付项目');
    }
    if (orderNo) {
      return orderNo;
    }
    if (target.type !== 'package') {
      return target.orderNo;
    }

    const phone = guardianPhone.trim();
    if (phone.length < 6 || !studentName.trim()) {
      throw new Error('请填写家长手机号和孩子姓名');
    }

    const attribution = getAttribution();
    const created = await createOrder({
      packageId: target.packageId,
      courseId: target.courseId,
      guardianName: guardianName.trim() || undefined,
      guardianPhone: phone,
      studentName: studentName.trim(),
      grade: grade.trim() || undefined,
      source: attribution.source,
      campaign: attribution.campaign,
      medium: attribution.medium,
    });

    setOrderNo(created.order.orderNo);
    setCheckout(created.checkout);
    return created.order.orderNo;
  }

  async function pay(provider: PaymentProvider) {
    setBusy(true);
    setError('');
    setPaymentHint('');
    try {
      const currentOrderNo = await ensureOrder();
      const created = await createPaymentIntent(currentOrderNo, provider);
      setIntent(created);
      setStep('payment');
      setRedirectOpened(false);

      if (created.status === 'paid') {
        await reconcilePayment(currentOrderNo);
        return;
      }

      if (created.nextAction === 'render_qr' || created.nextAction === 'redirect') {
        startPolling(currentOrderNo);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发起支付失败');
      if (!orderNo && target?.type === 'package') {
        setStep('form');
      }
    } finally {
      setBusy(false);
    }
  }

  async function payMock() {
    setBusy(true);
    setError('');
    setPaymentHint('');
    try {
      const currentOrderNo = await ensureOrder();
      const order = await mockPayOrder(currentOrderNo);
      markPaid(order);
    } catch (err) {
      setError(err instanceof Error ? err.message : '模拟支付失败');
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    if (!orderNo) return;
    setSyncing(true);
    setError('');
    setPaymentHint('');
    try {
      await reconcilePayment(orderNo, { showPendingHint: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '验单失败，请稍后再试');
    } finally {
      setSyncing(false);
    }
  }

  function openRedirectPayment() {
    const checkoutUrl = intent?.payload.checkoutUrl;
    if (!checkoutUrl) return;
    window.open(String(checkoutUrl), '_blank', 'noopener,noreferrer');
    setRedirectOpened(true);
  }

  const providerByCode = new Map(providers.map((provider) => [provider.code, provider]));
  const liveProviders = providers.filter((provider) => provider.code !== 'mock');
  const mockProvider = providerByCode.get('mock');
  const title = target?.type === 'package' ? '购买课时包' : '支付试听席位保留费';
  const inputClass = 'border-line rounded-xl border bg-surface px-3 py-2.5 text-sm';
  const canReconcile =
    Boolean(orderNo && intent && intent.provider !== 'mock') &&
    (intent?.nextAction === 'render_qr' || intent?.nextAction === 'redirect');
  const successTitle =
    target?.type === 'order' ? target.successTitle : target ? '支付成功' : '支付成功';
  const successMessage =
    target?.type === 'order'
      ? target.successMessage
      : target?.type === 'package'
        ? `${target.lessonCount} 课时已到账。`
        : '';

  return (
    <Modal open={open && Boolean(target)} onClose={onClose} title={title} panelClassName="max-w-lg">
      {target ? (
        <div className="space-y-4">
          <section className="bg-paper rounded-2xl p-4">
            <div className="text-ink text-sm font-semibold">{target.title}</div>
            <div className="text-muted mt-1 text-xs">{target.subtitle}</div>
            {target.type === 'package' && target.description ? (
              <p className="text-ink-soft mt-2 text-sm leading-6">{target.description}</p>
            ) : null}
            <div className="text-brand mt-3 text-2xl font-bold">{money(target.amount)}</div>
            {orderNo ? <div className="text-muted mt-1 text-xs">订单 {orderNo}</div> : null}
          </section>

          {step === 'done' ? (
            <section className="rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-green-600">
                <Check className="h-5 w-5 text-white" />
              </div>
              <div className="mt-3 text-base font-bold text-green-800">{successTitle}</div>
              <p className="mt-1 text-sm text-green-700">{successMessage}</p>
              {checkout?.defaultPassword ? (
                <p className="mt-3 rounded-xl bg-white p-3 text-left text-sm text-green-800">
                  可用手机号 {checkout.loginIdentifier} 和默认密码 {checkout.defaultPassword}{' '}
                  登录，首次登录需修改密码。
                </p>
              ) : null}
              <a
                href={
                  target.type === 'order' ? (target.successActionHref ?? '/account') : '/account'
                }
                className="pwbtn pwbtn-primary mt-4 w-full"
              >
                {target.type === 'order'
                  ? (target.successActionLabel ?? '查看预约')
                  : '查看课时余额'}
              </a>
            </section>
          ) : (
            <>
              {target.type === 'package' && step === 'form' ? (
                <form
                  className="grid gap-3"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    setBusy(true);
                    setError('');
                    void ensureOrder()
                      .then(() => setStep('payment'))
                      .catch((err: unknown) =>
                        setError(err instanceof Error ? err.message : '创建订单失败'),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  <input
                    className={inputClass}
                    placeholder="家长称呼（可选）"
                    value={guardianName}
                    onChange={(event) => setGuardianName(event.target.value)}
                  />
                  <input
                    className={inputClass}
                    placeholder="家长手机号"
                    inputMode="tel"
                    value={guardianPhone}
                    onChange={(event) => setGuardianPhone(event.target.value)}
                    required
                  />
                  <input
                    className={inputClass}
                    placeholder="孩子姓名"
                    value={studentName}
                    onChange={(event) => setStudentName(event.target.value)}
                    required
                  />
                  <input
                    className={inputClass}
                    placeholder="年级（可选）"
                    value={grade}
                    onChange={(event) => setGrade(event.target.value)}
                  />
                  <button type="submit" className="pwbtn pwbtn-primary w-full" disabled={busy}>
                    确认购买信息
                  </button>
                </form>
              ) : (
                <section className="space-y-3">
                  {intent?.nextAction === 'render_qr' && intent.payload.qrCodeDataUrl ? (
                    <div className="border-line rounded-2xl border p-4 text-center">
                      <div className="text-ink text-sm font-semibold">
                        请使用 {PROVIDER_LABEL[intent.provider]} 扫码支付
                      </div>
                      <img
                        src={intent.payload.qrCodeDataUrl}
                        alt="支付二维码"
                        className="mx-auto mt-3 h-56 w-56 rounded-xl bg-white"
                      />
                      <div className="text-muted mt-3 flex items-center justify-center gap-2 text-xs">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        等待支付结果...
                      </div>
                    </div>
                  ) : null}

                  {intent?.nextAction === 'redirect' && intent.payload.checkoutUrl ? (
                    <div className="border-line rounded-2xl border p-4 text-center">
                      <div className="text-ink text-sm font-semibold">跳转到支付页</div>
                      <p className="text-muted mt-1 text-xs">
                        在新窗口完成支付，当前弹框会继续等待支付结果。
                      </p>
                      <button
                        type="button"
                        className="pwbtn pwbtn-primary mt-3 w-full"
                        onClick={openRedirectPayment}
                      >
                        <ExternalLink className="h-4 w-4" />
                        {redirectOpened ? '重新打开支付页' : '打开支付页'}
                      </button>
                    </div>
                  ) : null}

                  <div>
                    <div className="text-ink mb-2 text-sm font-semibold">选择支付方式</div>
                    <div className="grid gap-2">
                      {liveProviders.map((provider) => (
                        <button
                          key={provider.code}
                          type="button"
                          onClick={() => void pay(provider.code)}
                          disabled={busy || !provider.configured}
                          className="pwbtn pwbtn-primary w-full disabled:opacity-60"
                        >
                          {providerDisplayLabel(provider)}
                          {!provider.configured ? '（未开通）' : ''}
                        </button>
                      ))}
                      {mockProvider ? (
                        <button
                          type="button"
                          onClick={() =>
                            intent?.provider === 'mock' ? void payMock() : void pay('mock')
                          }
                          disabled={busy || !mockProvider.configured}
                          className="pwbtn pwbtn-outline w-full disabled:opacity-60"
                        >
                          {intent?.provider === 'mock' ? '确认模拟支付' : '模拟支付（开发）'}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {canReconcile ? (
                    <button
                      type="button"
                      className="pwbtn pwbtn-outline w-full"
                      onClick={() => void syncNow()}
                      disabled={syncing}
                    >
                      <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                      {syncing ? '验单中...' : '已支付，立即验单'}
                    </button>
                  ) : null}

                  {paymentHint ? (
                    <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                      {paymentHint}
                    </div>
                  ) : null}
                </section>
              )}

              {error ? (
                <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
