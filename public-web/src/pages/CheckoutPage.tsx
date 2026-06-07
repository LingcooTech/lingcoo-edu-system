import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';

import {
  createOrder,
  createPaymentIntent,
  fetchCoursePackages,
  fetchPaymentProviders,
  loadHome,
  mockPayOrder,
  syncPayment,
  type CheckoutInfo,
  type CoursePackage,
  type PaymentIntent,
  type PaymentProvider,
  type PaymentProviderStatus,
} from '@/api/client';
import { getAttribution } from '@/lib/attribution';
import { money } from '@/lib/utils';

type Step = 'select' | 'pay' | 'done';

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

export function CheckoutPage() {
  const { packageId = '' } = useParams();
  const [pkg, setPkg] = useState<CoursePackage | null>(null);
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [studentName, setStudentName] = useState('');
  const [grade, setGrade] = useState('');
  const [step, setStep] = useState<Step>('select');
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [providers, setProviders] = useState<PaymentProviderStatus[]>(DEFAULT_PROVIDERS);
  const [onlinePackageSalesAllowed, setOnlinePackageSalesAllowed] = useState(true);
  const [orderNo, setOrderNo] = useState('');
  const [checkout, setCheckout] = useState<CheckoutInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Promise.all([
      fetchCoursePackages(),
      fetchPaymentProviders().catch(() => DEFAULT_PROVIDERS),
      loadHome().catch(() => null),
    ])
      .then(([packages, paymentProviders, home]) => {
        setPkg(packages.find((p) => p.id === packageId) ?? null);
        setProviders(paymentProviders);
        const businessModel = home?.organization.businessModel;
        setOnlinePackageSalesAllowed(!businessModel || businessModel.onlinePackageSalesEnabled);
      })
      .finally(() => setLoading(false));

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [packageId]);

  function startPolling(no: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const result = await syncPayment(no);
        if (result.item.status === 'paid') {
          if (pollRef.current) clearInterval(pollRef.current);
          setStep('done');
        }
      } catch {
        // Keep polling through short provider/network hiccups.
      }
    }, 3000);
  }

  async function ensureOrder() {
    if (orderNo) return orderNo;
    const phone = guardianPhone.trim();
    if (phone.length < 6 || !studentName.trim()) {
      throw new Error('请填写家长手机号和孩子姓名');
    }
    const attribution = getAttribution();
    const created = await createOrder({
      packageId,
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
    try {
      const currentOrderNo = await ensureOrder();
      const created = await createPaymentIntent(currentOrderNo, provider);
      setIntent(created);
      setStep('pay');

      if (created.status === 'paid') {
        setStep('done');
        return;
      }
      if (created.nextAction === 'redirect' && created.payload.checkoutUrl) {
        startPolling(currentOrderNo);
        window.location.href = created.payload.checkoutUrl;
        return;
      }
      if (created.nextAction === 'render_qr') {
        startPolling(currentOrderNo);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发起支付失败');
      setStep('select');
    } finally {
      setBusy(false);
    }
  }

  async function payMock() {
    setBusy(true);
    setError('');
    try {
      const currentOrderNo = await ensureOrder();
      await mockPayOrder(currentOrderNo);
      if (pollRef.current) clearInterval(pollRef.current);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : '模拟支付失败');
    } finally {
      setBusy(false);
    }
  }

  const providerByCode = new Map(providers.map((provider) => [provider.code, provider]));
  const liveProviders = providers.filter((provider) => provider.code !== 'mock');
  const mockProvider = providerByCode.get('mock');

  if (loading) {
    return <main className="px-5 py-10 text-center text-sm text-slate-500">加载中...</main>;
  }

  if (!pkg || !onlinePackageSalesAllowed) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-10 text-center">
        <p className="text-sm text-slate-500">
          {!pkg ? '课时包不存在或已下架。' : '当前机构不支持线上购买课时包。'}
        </p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium text-blue-600">
          返回首页
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeft className="h-4 w-4" />
        返回
      </Link>

      <div className="mt-4 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="text-xs font-semibold tracking-wide text-blue-600 uppercase">Checkout</div>
        <h1 className="mt-1 text-xl font-bold">{pkg.name}</h1>
        <div className="mt-1 text-sm text-slate-500">{pkg.lessonCount} 课时</div>
        {pkg.description && (
          <p className="mt-2 text-sm leading-6 text-slate-600">{pkg.description}</p>
        )}
        <div className="mt-3 text-2xl font-bold text-blue-700">{money(pkg.priceAmount)}</div>
      </div>

      {step === 'done' ? (
        <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-600">
            <Check className="h-6 w-6 text-white" />
          </div>
          <div className="mt-3 text-lg font-bold text-green-800">支付成功</div>
          <p className="mt-1 text-sm text-green-700">{pkg.lessonCount} 课时已到账。</p>
          {checkout?.defaultPassword && (
            <p className="mt-3 rounded-xl bg-white p-3 text-sm text-green-800">
              可用手机号 {checkout.loginIdentifier} 和默认密码 {checkout.defaultPassword}{' '}
              登录，首次登录需修改密码。
            </p>
          )}
          <Link
            to="/account"
            className="mt-4 inline-block rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            查看课时余额
          </Link>
        </div>
      ) : (
        <>
          <section className="mt-6 rounded-2xl border bg-white p-5">
            <div className="text-sm font-semibold text-slate-700">购买信息</div>
            <div className="mt-4 grid gap-3">
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                placeholder="家长称呼（可选）"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                disabled={Boolean(orderNo)}
              />
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                placeholder="家长手机号"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                disabled={Boolean(orderNo)}
              />
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                placeholder="孩子姓名"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                disabled={Boolean(orderNo)}
              />
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                placeholder="年级（可选）"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                disabled={Boolean(orderNo)}
              />
            </div>
          </section>

          {intent && intent.nextAction === 'render_qr' && intent.payload.qrCodeDataUrl && (
            <section className="mt-6 rounded-2xl border bg-white p-5 text-center">
              <div className="text-sm font-semibold text-slate-700">
                请使用 {PROVIDER_LABEL[intent.provider]} 扫码支付
              </div>
              <img
                src={intent.payload.qrCodeDataUrl}
                alt="支付二维码"
                className="mx-auto mt-3 h-56 w-56"
              />
              <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                等待支付结果...
              </div>
            </section>
          )}

          <section className="mt-6">
            <div className="mb-2 text-sm font-semibold text-slate-700">选择支付方式</div>
            <div className="grid gap-2">
              {liveProviders.map((provider) => (
                <button
                  key={provider.code}
                  onClick={() => pay(provider.code)}
                  disabled={busy || !provider.configured}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 ${
                    provider.code === 'wechat_pay' ? 'bg-green-600' : 'bg-blue-600'
                  }`}
                >
                  {provider.label}
                  {!provider.configured ? '（未开通）' : ''}
                </button>
              ))}
              {mockProvider && (
                <button
                  onClick={() => (orderNo ? payMock() : pay('mock'))}
                  disabled={busy || !mockProvider.configured}
                  className="rounded-xl border border-dashed border-slate-400 px-4 py-3 text-sm font-semibold text-slate-600 disabled:opacity-60"
                >
                  {orderNo && intent?.provider === 'mock' ? '确认模拟支付' : '模拟支付（开发）'}
                </button>
              )}
            </div>
          </section>

          {error && (
            <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
        </>
      )}
    </main>
  );
}
