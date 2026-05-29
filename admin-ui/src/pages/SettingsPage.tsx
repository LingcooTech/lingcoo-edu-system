import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import {
  fetchPaymentSettings,
  fetchTenantPublicProfile,
  saveTenantPublicProfile,
  saveAlipaySettings,
  saveWechatSettings,
} from '@/api/client';
import type { PaymentProviderItem } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { tenantId } from '@/lib/foundation';

const SOURCE_LABEL: Record<string, string> = {
  database: '后台配置',
  env: '环境变量',
  none: '未配置',
};

function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        configured ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
      }`}
    >
      {configured ? '已配置' : '未配置'}
    </span>
  );
}

const inputClass = 'mt-1 w-full rounded-lg border px-3 py-2 text-sm';

function linesToList(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function SettingsPage() {
  const [items, setItems] = useState<PaymentProviderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState({
    headline: '',
    introduction: '',
    highlightsText: '',
    promisesText: '',
  });
  const [wechat, setWechat] = useState({
    appId: '',
    mchId: '',
    appSecret: '',
    apiKey: '',
    notifyUrl: '',
  });
  const [alipay, setAlipay] = useState({
    appId: '',
    gateway: '',
    notifyUrl: '',
    returnUrl: '',
    privateKeyPem: '',
    publicKeyPem: '',
    keyType: 'PKCS1' as 'PKCS1' | 'PKCS8',
    f2fPay: false,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingWechat, setSavingWechat] = useState(false);
  const [savingAlipay, setSavingAlipay] = useState(false);

  const wechatItem = items.find((item) => item.code === 'wechat_pay');
  const alipayItem = items.find((item) => item.code === 'alipay');

  function loadPaymentSettings() {
    return fetchPaymentSettings(tenantId).then((data) => {
      setItems(data.items);
      const w = data.items.find((i) => i.code === 'wechat_pay');
      const a = data.items.find((i) => i.code === 'alipay');
      if (w) {
        setWechat((prev) => ({
          ...prev,
          appId: String(w.values.appId ?? ''),
          mchId: String(w.values.mchId ?? ''),
          notifyUrl: String(w.values.notifyUrl ?? ''),
        }));
      }
      if (a) {
        setAlipay((prev) => ({
          ...prev,
          appId: String(a.values.appId ?? ''),
          gateway: String(a.values.gateway ?? ''),
          notifyUrl: String(a.values.notifyUrl ?? ''),
          returnUrl: String(a.values.returnUrl ?? ''),
          keyType: (a.values.keyType as 'PKCS1' | 'PKCS8') ?? 'PKCS1',
          f2fPay: Boolean(a.values.f2fPay),
        }));
      }
    });
  }

  function loadPublicProfile() {
    return fetchTenantPublicProfile(tenantId).then((data) => {
      setProfile({
        headline: data.headline,
        introduction: data.introduction,
        highlightsText: data.highlights.join('\n'),
        promisesText: data.promises.join('\n'),
      });
    });
  }

  useEffect(() => {
    Promise.all([loadPaymentSettings(), loadPublicProfile()])
      .catch((err: Error) => setMessage(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function submitProfile(event: FormEvent) {
    event.preventDefault();
    setSavingProfile(true);
    setMessage('');
    try {
      const updated = await saveTenantPublicProfile(tenantId, {
        headline: profile.headline,
        introduction: profile.introduction,
        highlights: linesToList(profile.highlightsText),
        promises: linesToList(profile.promisesText),
      });
      setProfile({
        headline: updated.headline,
        introduction: updated.introduction,
        highlightsText: updated.highlights.join('\n'),
        promisesText: updated.promises.join('\n'),
      });
      setMessage('机构介绍已保存');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitWechat(event: FormEvent) {
    event.preventDefault();
    setSavingWechat(true);
    setMessage('');
    try {
      // Secrets are write-only: only send them when the admin typed a new value.
      await saveWechatSettings(tenantId, {
        appId: wechat.appId,
        mchId: wechat.mchId,
        notifyUrl: wechat.notifyUrl,
        ...(wechat.appSecret ? { appSecret: wechat.appSecret } : {}),
        ...(wechat.apiKey ? { apiKey: wechat.apiKey } : {}),
      });
      setWechat((prev) => ({ ...prev, appSecret: '', apiKey: '' }));
      await loadPaymentSettings();
      setMessage('微信支付配置已保存');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingWechat(false);
    }
  }

  async function submitAlipay(event: FormEvent) {
    event.preventDefault();
    setSavingAlipay(true);
    setMessage('');
    try {
      await saveAlipaySettings(tenantId, {
        appId: alipay.appId,
        gateway: alipay.gateway,
        notifyUrl: alipay.notifyUrl,
        returnUrl: alipay.returnUrl,
        keyType: alipay.keyType,
        f2fPay: alipay.f2fPay,
        ...(alipay.privateKeyPem ? { privateKeyPem: alipay.privateKeyPem } : {}),
        ...(alipay.publicKeyPem ? { publicKeyPem: alipay.publicKeyPem } : {}),
      });
      setAlipay((prev) => ({ ...prev, privateKeyPem: '', publicKeyPem: '' }));
      await loadPaymentSettings();
      setMessage('支付宝配置已保存');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingAlipay(false);
    }
  }

  return (
    <PageFrame section="settings">
      <div className="resource-card p-5">
        <div className="text-sm font-semibold">机构介绍</div>
        <p className="text-muted-foreground mt-1 text-sm">
          维护家长端“机构介绍”页面的核心文案。每行亮点会展示为一个独立条目。
        </p>
      </div>

      <form className="resource-card mt-4 p-5" onSubmit={submitProfile}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">页面主标题</span>
            <input
              className={inputClass}
              value={profile.headline}
              onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">机构简介</span>
            <textarea
              className={`${inputClass} h-24`}
              value={profile.introduction}
              onChange={(e) => setProfile({ ...profile, introduction: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">教学亮点（每行一条）</span>
            <textarea
              className={`${inputClass} h-28`}
              value={profile.highlightsText}
              onChange={(e) => setProfile({ ...profile, highlightsText: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">服务承诺（每行一条）</span>
            <textarea
              className={`${inputClass} h-28`}
              value={profile.promisesText}
              onChange={(e) => setProfile({ ...profile, promisesText: e.target.value })}
            />
          </label>
        </div>
        <button
          className="bg-primary text-primary-foreground mt-4 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          disabled={savingProfile || loading}
        >
          {savingProfile ? '保存中...' : '保存机构介绍'}
        </button>
      </form>

      <div className="resource-card mt-4 p-5">
        <div className="text-sm font-semibold">支付渠道</div>
        <p className="text-muted-foreground mt-1 text-sm">
          配置家长端在线购买课时包的收款渠道。密钥经 AES-256-GCM
          加密存库，保存后不回显，仅显示是否已配置。 回调地址需公网可达（已部署在
          edu.futuredecade.com）。
        </p>
      </div>

      {message && (
        <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{message}</div>
      )}

      {loading ? (
        <div className="text-muted-foreground mt-4 text-sm">加载中...</div>
      ) : (
        <div className="mt-4 grid gap-4">
          {/* WeChat Pay */}
          <form className="resource-card p-5" onSubmit={submitWechat}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">微信支付</span>
                <StatusBadge configured={Boolean(wechatItem?.configured)} />
              </div>
              <span className="text-muted-foreground text-xs">
                来源：{SOURCE_LABEL[wechatItem?.source ?? 'none']}
              </span>
            </div>
            {wechatItem?.notifyUrl && (
              <div className="text-muted-foreground mt-2 text-xs">
                回调地址：<code>{wechatItem.notifyUrl}</code>
              </div>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">App ID</span>
                <input
                  className={inputClass}
                  value={wechat.appId}
                  onChange={(e) => setWechat({ ...wechat, appId: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">商户号 (mchId)</span>
                <input
                  className={inputClass}
                  value={wechat.mchId}
                  onChange={(e) => setWechat({ ...wechat, mchId: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">App Secret</span>
                <input
                  className={inputClass}
                  type="password"
                  placeholder={
                    wechatItem?.secrets.appSecret?.configured ? '已配置（留空不变）' : ''
                  }
                  value={wechat.appSecret}
                  onChange={(e) => setWechat({ ...wechat, appSecret: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">API Key</span>
                <input
                  className={inputClass}
                  type="password"
                  placeholder={wechatItem?.secrets.apiKey?.configured ? '已配置（留空不变）' : ''}
                  value={wechat.apiKey}
                  onChange={(e) => setWechat({ ...wechat, apiKey: e.target.value })}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium">回调地址（可选，默认按域名推导）</span>
                <input
                  className={inputClass}
                  value={wechat.notifyUrl}
                  onChange={(e) => setWechat({ ...wechat, notifyUrl: e.target.value })}
                />
              </label>
            </div>
            <button
              className="bg-primary text-primary-foreground mt-4 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
              disabled={savingWechat}
            >
              {savingWechat ? '保存中...' : '保存微信支付'}
            </button>
          </form>

          {/* Alipay */}
          <form className="resource-card p-5" onSubmit={submitAlipay}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">支付宝</span>
                <StatusBadge configured={Boolean(alipayItem?.configured)} />
              </div>
              <span className="text-muted-foreground text-xs">
                来源：{SOURCE_LABEL[alipayItem?.source ?? 'none']}
              </span>
            </div>
            {alipayItem?.notifyUrl && (
              <div className="text-muted-foreground mt-2 text-xs">
                回调地址：<code>{alipayItem.notifyUrl}</code>
              </div>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">App ID</span>
                <input
                  className={inputClass}
                  value={alipay.appId}
                  onChange={(e) => setAlipay({ ...alipay, appId: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">网关地址</span>
                <input
                  className={inputClass}
                  placeholder="https://openapi.alipay.com/gateway.do"
                  value={alipay.gateway}
                  onChange={(e) => setAlipay({ ...alipay, gateway: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">密钥类型</span>
                <select
                  className={inputClass}
                  value={alipay.keyType}
                  onChange={(e) =>
                    setAlipay({ ...alipay, keyType: e.target.value as 'PKCS1' | 'PKCS8' })
                  }
                >
                  <option value="PKCS1">PKCS1</option>
                  <option value="PKCS8">PKCS8</option>
                </select>
              </label>
              <label className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  checked={alipay.f2fPay}
                  onChange={(e) => setAlipay({ ...alipay, f2fPay: e.target.checked })}
                />
                <span className="text-sm font-medium">当面付（扫码）</span>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium">
                  应用私钥 PEM
                  {alipayItem?.secrets.privateKeyPem?.configured ? '（已配置，留空不变）' : ''}
                </span>
                <textarea
                  className={`${inputClass} h-24 font-mono text-xs`}
                  value={alipay.privateKeyPem}
                  onChange={(e) => setAlipay({ ...alipay, privateKeyPem: e.target.value })}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium">
                  支付宝公钥 PEM
                  {alipayItem?.secrets.publicKeyPem?.configured ? '（已配置，留空不变）' : ''}
                </span>
                <textarea
                  className={`${inputClass} h-24 font-mono text-xs`}
                  value={alipay.publicKeyPem}
                  onChange={(e) => setAlipay({ ...alipay, publicKeyPem: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">异步回调地址（可选）</span>
                <input
                  className={inputClass}
                  value={alipay.notifyUrl}
                  onChange={(e) => setAlipay({ ...alipay, notifyUrl: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">同步返回地址（可选）</span>
                <input
                  className={inputClass}
                  value={alipay.returnUrl}
                  onChange={(e) => setAlipay({ ...alipay, returnUrl: e.target.value })}
                />
              </label>
            </div>
            <button
              className="bg-primary text-primary-foreground mt-4 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
              disabled={savingAlipay}
            >
              {savingAlipay ? '保存中...' : '保存支付宝'}
            </button>
          </form>
        </div>
      )}
    </PageFrame>
  );
}
