import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation } from 'react-router-dom';

import {
  clearQiniuSettings,
  clearSmtpSettings,
  fetchOrganization,
  fetchPaymentSettings,
  fetchQiniuSettings,
  fetchSmtpSettings,
  saveAlipaySettings,
  saveOrganization,
  saveQiniuSettings,
  saveSmtpSettings,
  saveWechatSettings,
  testQiniuSettings,
  testSmtpSettings,
} from '@/api/client';
import type { PaymentProviderItem, SystemSettingOverview } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';

const SOURCE_LABEL: Record<string, string> = {
  database: '后台配置',
  env: '环境变量',
  none: '未配置',
};

const tabs = [
  { key: 'brand', label: '品牌 VI' },
  { key: 'payment', label: '支付' },
  { key: 'smtp', label: 'SMTP' },
  { key: 'qiniu', label: '七牛云' },
] as const;

type TabKey = (typeof tabs)[number]['key'];
const integrationTabs = tabs.filter((tab) => tab.key !== 'brand');

const inputClass = 'mt-1 w-full rounded-lg border px-3 py-2 text-sm';
const buttonClass =
  'bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60';
const outlineButtonClass = 'rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60';

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

function SourceLabel({ source }: { source?: string }) {
  return (
    <span className="text-muted-foreground text-xs">
      来源：{SOURCE_LABEL[source ?? 'none'] ?? source}
    </span>
  );
}

function linesToList(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function stringValue(overview: SystemSettingOverview | null, key: string) {
  const value = overview?.values[key];
  return typeof value === 'string' ? value : '';
}

function boolValue(overview: SystemSettingOverview | null, key: string, fallback = false) {
  const value = overview?.values[key];
  return typeof value === 'boolean' ? value : fallback;
}

function numberValue(overview: SystemSettingOverview | null, key: string, fallback = 0) {
  const value = overview?.values[key];
  return typeof value === 'number' ? String(value) : String(fallback);
}

export function SettingsPage() {
  const location = useLocation();
  const isIntegrationPage = location.pathname.includes('/system/integrations');
  const visibleTabs = isIntegrationPage
    ? integrationTabs
    : tabs.filter((tab) => tab.key === 'brand');
  const [activeTab, setActiveTab] = useState<TabKey>(isIntegrationPage ? 'payment' : 'brand');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [paymentItems, setPaymentItems] = useState<PaymentProviderItem[]>([]);
  const [smtpOverview, setSmtpOverview] = useState<SystemSettingOverview | null>(null);
  const [qiniuOverview, setQiniuOverview] = useState<SystemSettingOverview | null>(null);

  const [org, setOrg] = useState({
    name: '',
    brandName: '',
    phone: '',
    address: '',
    headline: '',
    introduction: '',
    bannerImageUrl: '',
    bannerTitle: '',
    bannerSubtitle: '',
    ctaText: '',
    ctaLink: '',
    highlightsText: '',
    promisesText: '',
    statsText: '',
    testimonialsText: '',
    galleryText: '',
    faqText: '',
    businessHours: '',
    fullLogoUrl: '',
    squareLogoUrl: '',
    logoUrl: '',
    darkLogoUrl: '',
    faviconUrl: '',
    primaryColor: '',
    secondaryColor: '',
    backgroundColor: '',
    cardColor: '',
    textColor: '',
    headingFont: '',
    bodyFont: '',
    radius: '',
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
  const [smtp, setSmtp] = useState({
    host: '',
    port: '465',
    secure: true,
    user: '',
    password: '',
    from: '',
    testTo: '',
  });
  const [qiniu, setQiniu] = useState({
    accessKey: '',
    secretKey: '',
    bucketName: '',
    publicBaseUrl: '',
    uploadHost: '',
    defaultPrefix: '',
  });
  const [saving, setSaving] = useState<string | null>(null);

  const wechatItem = paymentItems.find((item) => item.code === 'wechat_pay');
  const alipayItem = paymentItems.find((item) => item.code === 'alipay');

  useEffect(() => {
    setActiveTab(isIntegrationPage ? 'payment' : 'brand');
  }, [isIntegrationPage]);

  function hydratePayment(items: PaymentProviderItem[]) {
    setPaymentItems(items);
    const w = items.find((i) => i.code === 'wechat_pay');
    const a = items.find((i) => i.code === 'alipay');
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
  }

  function hydrateSmtp(overview: SystemSettingOverview) {
    setSmtpOverview(overview);
    setSmtp((prev) => ({
      ...prev,
      host: stringValue(overview, 'host'),
      port: numberValue(overview, 'port', 465),
      secure: boolValue(overview, 'secure', true),
      user: stringValue(overview, 'user'),
      from: stringValue(overview, 'from'),
    }));
  }

  function hydrateQiniu(overview: SystemSettingOverview) {
    setQiniuOverview(overview);
    setQiniu((prev) => ({
      ...prev,
      accessKey: stringValue(overview, 'accessKey'),
      bucketName: stringValue(overview, 'bucketName'),
      publicBaseUrl: stringValue(overview, 'publicBaseUrl'),
      uploadHost: stringValue(overview, 'uploadHost'),
      defaultPrefix: stringValue(overview, 'defaultPrefix'),
    }));
  }

  async function reloadPayment() {
    const data = await fetchPaymentSettings();
    hydratePayment(data.items);
  }

  async function reloadSmtp() {
    hydrateSmtp(await fetchSmtpSettings());
  }

  async function reloadQiniu() {
    hydrateQiniu(await fetchQiniuSettings());
  }

  useEffect(() => {
    Promise.all([
      fetchOrganization(),
      fetchPaymentSettings(),
      fetchSmtpSettings(),
      fetchQiniuSettings(),
    ])
      .then(([organization, payment, smtpData, qiniuData]) => {
        setOrg({
          name: organization.name,
          brandName: organization.brandName,
          phone: organization.phone ?? '',
          address: organization.address ?? '',
          headline: organization.publicProfile.headline,
          introduction: organization.publicProfile.introduction,
          bannerImageUrl: organization.publicProfile.bannerImageUrl,
          bannerTitle: organization.publicProfile.bannerTitle,
          bannerSubtitle: organization.publicProfile.bannerSubtitle,
          ctaText: organization.publicProfile.ctaText,
          ctaLink: organization.publicProfile.ctaLink,
          highlightsText: organization.publicProfile.highlights.join('\n'),
          promisesText: organization.publicProfile.promises.join('\n'),
          statsText: organization.publicProfile.stats.join('\n'),
          testimonialsText: organization.publicProfile.testimonials.join('\n'),
          galleryText: organization.publicProfile.gallery.join('\n'),
          faqText: organization.publicProfile.faq.join('\n'),
          businessHours: organization.publicProfile.businessHours,
          fullLogoUrl: organization.branding.fullLogoUrl ?? organization.branding.logoUrl ?? '',
          squareLogoUrl: organization.branding.squareLogoUrl ?? '',
          logoUrl: organization.branding.logoUrl ?? organization.branding.fullLogoUrl ?? '',
          darkLogoUrl: organization.branding.darkLogoUrl ?? '',
          faviconUrl: organization.branding.faviconUrl ?? '',
          primaryColor: organization.branding.primaryColor ?? '',
          secondaryColor: organization.branding.secondaryColor ?? '',
          backgroundColor: organization.branding.backgroundColor ?? '',
          cardColor: organization.branding.cardColor ?? '',
          textColor: organization.branding.textColor ?? '',
          headingFont: organization.branding.headingFont ?? '',
          bodyFont: organization.branding.bodyFont ?? '',
          radius: organization.branding.radius ?? '',
        });
        hydratePayment(payment.items);
        hydrateSmtp(smtpData);
        hydrateQiniu(qiniuData);
      })
      .catch((err: Error) => setMessage(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function submitBrand(event: FormEvent) {
    event.preventDefault();
    setSaving('brand');
    setMessage('');
    try {
      const updated = await saveOrganization({
        name: org.name,
        brandName: org.brandName,
        phone: org.phone,
        address: org.address,
        publicProfile: {
          headline: org.headline,
          introduction: org.introduction,
          bannerImageUrl: org.bannerImageUrl,
          bannerTitle: org.bannerTitle,
          bannerSubtitle: org.bannerSubtitle,
          ctaText: org.ctaText,
          ctaLink: org.ctaLink,
          highlights: linesToList(org.highlightsText),
          promises: linesToList(org.promisesText),
          stats: linesToList(org.statsText),
          testimonials: linesToList(org.testimonialsText),
          gallery: linesToList(org.galleryText),
          faq: linesToList(org.faqText),
          businessHours: org.businessHours,
        },
        branding: {
          fullLogoUrl: org.fullLogoUrl,
          squareLogoUrl: org.squareLogoUrl,
          logoUrl: org.fullLogoUrl || org.logoUrl,
          darkLogoUrl: org.darkLogoUrl,
          faviconUrl: org.faviconUrl,
          primaryColor: org.primaryColor,
          secondaryColor: org.secondaryColor,
          backgroundColor: org.backgroundColor,
          cardColor: org.cardColor,
          textColor: org.textColor,
          headingFont: org.headingFont,
          bodyFont: org.bodyFont,
          radius: org.radius,
        },
      });
      setOrg((prev) => ({
        ...prev,
        headline: updated.publicProfile.headline,
        introduction: updated.publicProfile.introduction,
        bannerImageUrl: updated.publicProfile.bannerImageUrl,
        bannerTitle: updated.publicProfile.bannerTitle,
        bannerSubtitle: updated.publicProfile.bannerSubtitle,
        ctaText: updated.publicProfile.ctaText,
        ctaLink: updated.publicProfile.ctaLink,
        highlightsText: updated.publicProfile.highlights.join('\n'),
        promisesText: updated.publicProfile.promises.join('\n'),
        statsText: updated.publicProfile.stats.join('\n'),
        testimonialsText: updated.publicProfile.testimonials.join('\n'),
        galleryText: updated.publicProfile.gallery.join('\n'),
        faqText: updated.publicProfile.faq.join('\n'),
        businessHours: updated.publicProfile.businessHours,
      }));
      setMessage('品牌 VI 已保存');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(null);
    }
  }

  async function submitWechat(event: FormEvent) {
    event.preventDefault();
    setSaving('wechat');
    setMessage('');
    try {
      await saveWechatSettings({
        appId: wechat.appId,
        mchId: wechat.mchId,
        notifyUrl: wechat.notifyUrl,
        ...(wechat.appSecret ? { appSecret: wechat.appSecret } : {}),
        ...(wechat.apiKey ? { apiKey: wechat.apiKey } : {}),
      });
      setWechat((prev) => ({ ...prev, appSecret: '', apiKey: '' }));
      await reloadPayment();
      setMessage('微信支付配置已保存');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(null);
    }
  }

  async function submitAlipay(event: FormEvent) {
    event.preventDefault();
    setSaving('alipay');
    setMessage('');
    try {
      await saveAlipaySettings({
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
      await reloadPayment();
      setMessage('支付宝配置已保存');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(null);
    }
  }

  function smtpPayload() {
    return {
      host: smtp.host,
      port: Number(smtp.port) || 465,
      secure: smtp.secure,
      user: smtp.user,
      from: smtp.from,
      ...(smtp.password ? { password: smtp.password } : {}),
    };
  }

  async function submitSmtp(event: FormEvent) {
    event.preventDefault();
    setSaving('smtp');
    setMessage('');
    try {
      await saveSmtpSettings(smtpPayload());
      setSmtp((prev) => ({ ...prev, password: '' }));
      await reloadSmtp();
      setMessage('SMTP 配置已保存');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(null);
    }
  }

  async function testSmtp() {
    setSaving('smtp-test');
    setMessage('');
    try {
      await testSmtpSettings({ ...smtpPayload(), testTo: smtp.testTo });
      setMessage('SMTP 测试邮件已发送');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '测试失败');
    } finally {
      setSaving(null);
    }
  }

  async function clearSmtp() {
    setSaving('smtp-clear');
    setMessage('');
    try {
      await clearSmtpSettings();
      await reloadSmtp();
      setSmtp((prev) => ({ ...prev, password: '' }));
      setMessage('SMTP 配置已清除');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '清除失败');
    } finally {
      setSaving(null);
    }
  }

  function qiniuPayload() {
    return {
      accessKey: qiniu.accessKey,
      bucketName: qiniu.bucketName,
      publicBaseUrl: qiniu.publicBaseUrl,
      uploadHost: qiniu.uploadHost,
      defaultPrefix: qiniu.defaultPrefix,
      ...(qiniu.secretKey ? { secretKey: qiniu.secretKey } : {}),
    };
  }

  async function submitQiniu(event: FormEvent) {
    event.preventDefault();
    setSaving('qiniu');
    setMessage('');
    try {
      await saveQiniuSettings(qiniuPayload());
      setQiniu((prev) => ({ ...prev, secretKey: '' }));
      await reloadQiniu();
      setMessage('七牛云配置已保存');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(null);
    }
  }

  async function testQiniu() {
    setSaving('qiniu-test');
    setMessage('');
    try {
      await testQiniuSettings(qiniuPayload());
      setMessage('七牛云连接测试通过');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '测试失败');
    } finally {
      setSaving(null);
    }
  }

  async function clearQiniu() {
    setSaving('qiniu-clear');
    setMessage('');
    try {
      await clearQiniuSettings();
      await reloadQiniu();
      setQiniu((prev) => ({ ...prev, secretKey: '' }));
      setMessage('七牛云配置已清除');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '清除失败');
    } finally {
      setSaving(null);
    }
  }

  return (
    <PageFrame section="settings">
      <div className="resource-card p-5">
        <div className="text-sm font-semibold">系统设置</div>
        <p className="text-muted-foreground mt-1 text-sm">
          统一维护机构品牌、支付渠道、SMTP 邮件和七牛云存储。密钥字段留空表示保持原值。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                activeTab === tab.key ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{message}</div>
      )}

      {loading ? (
        <div className="text-muted-foreground mt-4 text-sm">加载中...</div>
      ) : (
        <>
          {activeTab === 'brand' && (
            <form className="resource-card mt-4 p-5" onSubmit={submitBrand}>
              <div className="text-sm font-semibold">品牌 VI / 机构介绍</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium">机构名称</span>
                  <input
                    className={inputClass}
                    value={org.name}
                    onChange={(e) => setOrg({ ...org, name: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">品牌名</span>
                  <input
                    className={inputClass}
                    value={org.brandName}
                    onChange={(e) => setOrg({ ...org, brandName: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">电话</span>
                  <input
                    className={inputClass}
                    value={org.phone}
                    onChange={(e) => setOrg({ ...org, phone: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">地址</span>
                  <input
                    className={inputClass}
                    value={org.address}
                    onChange={(e) => setOrg({ ...org, address: e.target.value })}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium">页面主标题</span>
                  <input
                    className={inputClass}
                    value={org.headline}
                    onChange={(e) => setOrg({ ...org, headline: e.target.value })}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium">机构简介</span>
                  <textarea
                    className={`${inputClass} h-24`}
                    value={org.introduction}
                    onChange={(e) => setOrg({ ...org, introduction: e.target.value })}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium">Banner 图片 URL</span>
                  <input
                    className={inputClass}
                    placeholder="机构主页首屏大图"
                    value={org.bannerImageUrl}
                    onChange={(e) => setOrg({ ...org, bannerImageUrl: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Banner 标题</span>
                  <input
                    className={inputClass}
                    value={org.bannerTitle}
                    onChange={(e) => setOrg({ ...org, bannerTitle: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Banner 副标题</span>
                  <input
                    className={inputClass}
                    value={org.bannerSubtitle}
                    onChange={(e) => setOrg({ ...org, bannerSubtitle: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">主按钮文案</span>
                  <input
                    className={inputClass}
                    placeholder="预约试听"
                    value={org.ctaText}
                    onChange={(e) => setOrg({ ...org, ctaText: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">主按钮链接</span>
                  <input
                    className={inputClass}
                    placeholder="/register"
                    value={org.ctaLink}
                    onChange={(e) => setOrg({ ...org, ctaLink: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">教学亮点（每行一条）</span>
                  <textarea
                    className={`${inputClass} h-28`}
                    value={org.highlightsText}
                    onChange={(e) => setOrg({ ...org, highlightsText: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">服务承诺（每行一条）</span>
                  <textarea
                    className={`${inputClass} h-28`}
                    value={org.promisesText}
                    onChange={(e) => setOrg({ ...org, promisesText: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">运营数据（每行一条）</span>
                  <textarea
                    className={`${inputClass} h-28`}
                    value={org.statsText}
                    onChange={(e) => setOrg({ ...org, statsText: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">用户评价（每行一条）</span>
                  <textarea
                    className={`${inputClass} h-28`}
                    value={org.testimonialsText}
                    onChange={(e) => setOrg({ ...org, testimonialsText: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">环境/作品图片 URL（每行一条）</span>
                  <textarea
                    className={`${inputClass} h-28`}
                    value={org.galleryText}
                    onChange={(e) => setOrg({ ...org, galleryText: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">常见问题（每行一条）</span>
                  <textarea
                    className={`${inputClass} h-28`}
                    value={org.faqText}
                    onChange={(e) => setOrg({ ...org, faqText: e.target.value })}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium">营业/上课时间</span>
                  <input
                    className={inputClass}
                    value={org.businessHours}
                    onChange={(e) => setOrg({ ...org, businessHours: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">完整 Logo URL</span>
                  <input
                    className={inputClass}
                    placeholder="横版完整 logo，适合页眉/官网使用"
                    value={org.fullLogoUrl}
                    onChange={(e) => setOrg({ ...org, fullLogoUrl: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">方形 Logo URL</span>
                  <input
                    className={inputClass}
                    placeholder="方形图标，适合头像/小程序/应用图标"
                    value={org.squareLogoUrl}
                    onChange={(e) => setOrg({ ...org, squareLogoUrl: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">暗色 Logo URL</span>
                  <input
                    className={inputClass}
                    value={org.darkLogoUrl}
                    onChange={(e) => setOrg({ ...org, darkLogoUrl: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">兼容 Logo URL</span>
                  <input
                    className={inputClass}
                    placeholder="历史字段；为空时保存完整 Logo"
                    value={org.logoUrl}
                    onChange={(e) => setOrg({ ...org, logoUrl: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Favicon URL</span>
                  <input
                    className={inputClass}
                    value={org.faviconUrl}
                    onChange={(e) => setOrg({ ...org, faviconUrl: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">主色</span>
                  <input
                    className={inputClass}
                    placeholder="#1f6f5b"
                    value={org.primaryColor}
                    onChange={(e) => setOrg({ ...org, primaryColor: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">辅助色</span>
                  <input
                    className={inputClass}
                    placeholder="#f2a65a"
                    value={org.secondaryColor}
                    onChange={(e) => setOrg({ ...org, secondaryColor: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">背景色</span>
                  <input
                    className={inputClass}
                    value={org.backgroundColor}
                    onChange={(e) => setOrg({ ...org, backgroundColor: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">卡片色</span>
                  <input
                    className={inputClass}
                    value={org.cardColor}
                    onChange={(e) => setOrg({ ...org, cardColor: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">文字色</span>
                  <input
                    className={inputClass}
                    value={org.textColor}
                    onChange={(e) => setOrg({ ...org, textColor: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">标题字体</span>
                  <input
                    className={inputClass}
                    value={org.headingFont}
                    onChange={(e) => setOrg({ ...org, headingFont: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">正文字体</span>
                  <input
                    className={inputClass}
                    value={org.bodyFont}
                    onChange={(e) => setOrg({ ...org, bodyFont: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">圆角</span>
                  <input
                    className={inputClass}
                    placeholder="18px"
                    value={org.radius}
                    onChange={(e) => setOrg({ ...org, radius: e.target.value })}
                  />
                </label>
              </div>
              <button className={`${buttonClass} mt-4`} disabled={saving === 'brand'}>
                {saving === 'brand' ? '保存中...' : '保存品牌 VI'}
              </button>
            </form>
          )}

          {activeTab === 'payment' && (
            <div className="mt-4 grid gap-4">
              <form className="resource-card p-5" onSubmit={submitWechat}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">微信支付</span>
                    <StatusBadge configured={Boolean(wechatItem?.configured)} />
                  </div>
                  <SourceLabel source={wechatItem?.source} />
                </div>
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
                    <span className="text-sm font-medium">商户号</span>
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
                      placeholder={
                        wechatItem?.secrets.apiKey?.configured ? '已配置（留空不变）' : ''
                      }
                      value={wechat.apiKey}
                      onChange={(e) => setWechat({ ...wechat, apiKey: e.target.value })}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-sm font-medium">回调地址</span>
                    <input
                      className={inputClass}
                      value={wechat.notifyUrl}
                      onChange={(e) => setWechat({ ...wechat, notifyUrl: e.target.value })}
                    />
                  </label>
                </div>
                <button className={`${buttonClass} mt-4`} disabled={saving === 'wechat'}>
                  {saving === 'wechat' ? '保存中...' : '保存微信支付'}
                </button>
              </form>

              <form className="resource-card p-5" onSubmit={submitAlipay}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">支付宝</span>
                    <StatusBadge configured={Boolean(alipayItem?.configured)} />
                  </div>
                  <SourceLabel source={alipayItem?.source} />
                </div>
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
                      应用私钥 PEM{' '}
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
                      支付宝公钥 PEM{' '}
                      {alipayItem?.secrets.publicKeyPem?.configured ? '（已配置，留空不变）' : ''}
                    </span>
                    <textarea
                      className={`${inputClass} h-24 font-mono text-xs`}
                      value={alipay.publicKeyPem}
                      onChange={(e) => setAlipay({ ...alipay, publicKeyPem: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium">异步回调地址</span>
                    <input
                      className={inputClass}
                      value={alipay.notifyUrl}
                      onChange={(e) => setAlipay({ ...alipay, notifyUrl: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium">同步返回地址</span>
                    <input
                      className={inputClass}
                      value={alipay.returnUrl}
                      onChange={(e) => setAlipay({ ...alipay, returnUrl: e.target.value })}
                    />
                  </label>
                </div>
                <button className={`${buttonClass} mt-4`} disabled={saving === 'alipay'}>
                  {saving === 'alipay' ? '保存中...' : '保存支付宝'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'smtp' && (
            <form className="resource-card mt-4 p-5" onSubmit={submitSmtp}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">SMTP 邮件</span>
                  <StatusBadge configured={Boolean(smtpOverview?.configured)} />
                </div>
                <SourceLabel source={smtpOverview?.source} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium">Host</span>
                  <input
                    className={inputClass}
                    value={smtp.host}
                    onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Port</span>
                  <input
                    className={inputClass}
                    value={smtp.port}
                    onChange={(e) => setSmtp({ ...smtp, port: e.target.value })}
                  />
                </label>
                <label className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    checked={smtp.secure}
                    onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked })}
                  />
                  <span className="text-sm font-medium">SSL/TLS secure</span>
                </label>
                <label className="block">
                  <span className="text-sm font-medium">User</span>
                  <input
                    className={inputClass}
                    value={smtp.user}
                    onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Password</span>
                  <input
                    className={inputClass}
                    type="password"
                    placeholder={
                      smtpOverview?.secrets.password?.configured ? '已配置（留空不变）' : ''
                    }
                    value={smtp.password}
                    onChange={(e) => setSmtp({ ...smtp, password: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">From</span>
                  <input
                    className={inputClass}
                    value={smtp.from}
                    onChange={(e) => setSmtp({ ...smtp, from: e.target.value })}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium">测试收件人</span>
                  <input
                    className={inputClass}
                    value={smtp.testTo}
                    onChange={(e) => setSmtp({ ...smtp, testTo: e.target.value })}
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className={buttonClass} disabled={saving === 'smtp'}>
                  {saving === 'smtp' ? '保存中...' : '保存 SMTP'}
                </button>
                <button
                  type="button"
                  className={outlineButtonClass}
                  disabled={saving === 'smtp-test'}
                  onClick={testSmtp}
                >
                  发送测试邮件
                </button>
                <button
                  type="button"
                  className={outlineButtonClass}
                  disabled={saving === 'smtp-clear'}
                  onClick={clearSmtp}
                >
                  清除配置
                </button>
              </div>
            </form>
          )}

          {activeTab === 'qiniu' && (
            <form className="resource-card mt-4 p-5" onSubmit={submitQiniu}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">七牛云存储</span>
                  <StatusBadge configured={Boolean(qiniuOverview?.configured)} />
                </div>
                <SourceLabel source={qiniuOverview?.source} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium">Access Key</span>
                  <input
                    className={inputClass}
                    value={qiniu.accessKey}
                    onChange={(e) => setQiniu({ ...qiniu, accessKey: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Secret Key</span>
                  <input
                    className={inputClass}
                    type="password"
                    placeholder={
                      qiniuOverview?.secrets.secretKey?.configured ? '已配置（留空不变）' : ''
                    }
                    value={qiniu.secretKey}
                    onChange={(e) => setQiniu({ ...qiniu, secretKey: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Bucket</span>
                  <input
                    className={inputClass}
                    value={qiniu.bucketName}
                    onChange={(e) => setQiniu({ ...qiniu, bucketName: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">默认目录</span>
                  <input
                    className={inputClass}
                    value={qiniu.defaultPrefix}
                    onChange={(e) => setQiniu({ ...qiniu, defaultPrefix: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">公共域名</span>
                  <input
                    className={inputClass}
                    placeholder="https://cdn.example.com"
                    value={qiniu.publicBaseUrl}
                    onChange={(e) => setQiniu({ ...qiniu, publicBaseUrl: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">上传 Host</span>
                  <input
                    className={inputClass}
                    placeholder="https://upload.qiniup.com"
                    value={qiniu.uploadHost}
                    onChange={(e) => setQiniu({ ...qiniu, uploadHost: e.target.value })}
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className={buttonClass} disabled={saving === 'qiniu'}>
                  {saving === 'qiniu' ? '保存中...' : '保存七牛云'}
                </button>
                <button
                  type="button"
                  className={outlineButtonClass}
                  disabled={saving === 'qiniu-test'}
                  onClick={testQiniu}
                >
                  测试连接
                </button>
                <button
                  type="button"
                  className={outlineButtonClass}
                  disabled={saving === 'qiniu-clear'}
                  onClick={clearQiniu}
                >
                  清除配置
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </PageFrame>
  );
}
