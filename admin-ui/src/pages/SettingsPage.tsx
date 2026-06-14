import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import {
  clearContentImportSettings,
  clearQiniuSettings,
  clearSmtpSettings,
  fetchContentImportSettings,
  fetchOrganization,
  fetchPaymentSettings,
  fetchQiniuSettings,
  fetchSmtpSettings,
  saveAlipaySettings,
  saveContentImportSettings,
  saveOrganization,
  saveQiniuSettings,
  saveSmtpSettings,
  saveWechatSettings,
  testNotionImportSettings,
  testQiniuSettings,
  testSmtpSettings,
  testWordPressImportSettings,
} from '@/api/client';
import type {
  ContentImportSettingsOverview,
  PaymentProviderItem,
  PublicNavItem,
  PublicSiteSettings,
  SystemSettingOverview,
} from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { AdminTabs } from '@/components/shared/AdminTabs';
import { Field } from '@/components/shared/FormField';
import { QiniuImageField, QiniuMediaLibrary } from '@/components/shared/QiniuImageField';
import { notifyAdminOrganizationUpdated } from '@/lib/admin-theme';
import { updateDocumentFavicon } from '@/lib/favicon';

const SOURCE_LABEL: Record<string, string> = {
  database: '后台配置',
  env: '环境变量',
  none: '未配置',
};

const brandTabs = [
  { key: 'identity', label: '基础 VI', description: '品牌名、Logo、颜色、字体和圆角' },
  { key: 'navigation', label: 'Header 菜单', description: '前台顶部导航名称、路径和显示状态' },
  { key: 'footer', label: 'Footer 备案', description: '网站底部备案信息与跳转链接' },
] as const;

const integrationTabs = [
  { key: 'payment', label: '支付配置' },
  { key: 'smtp', label: 'SMTP 邮件' },
  { key: 'contentImport', label: '内容导入' },
  { key: 'qiniu', label: '七牛云' },
] as const;

type BrandTabKey = (typeof brandTabs)[number]['key'];
type IntegrationTabKey = (typeof integrationTabs)[number]['key'];

interface BrandFormState {
  name: string;
  brandName: string;
  phone: string;
  address: string;
  fullLogoUrl: string;
  squareLogoUrl: string;
  logoUrl: string;
  darkLogoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  cardColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  radius: string;
}

const BRAND_COLOR_FIELDS: Array<{
  key: keyof Pick<
    BrandFormState,
    'primaryColor' | 'secondaryColor' | 'backgroundColor' | 'cardColor' | 'textColor'
  >;
  label: string;
  fallback: string;
}> = [
  { key: 'primaryColor', label: '主色', fallback: '#9a6a4b' },
  { key: 'secondaryColor', label: '辅助色', fallback: '#211f1c' },
  { key: 'backgroundColor', label: '背景色', fallback: '#f6f4f0' },
  { key: 'cardColor', label: '卡片色', fallback: '#ffffff' },
  { key: 'textColor', label: '文字色', fallback: '#211f1c' },
];

const DEFAULT_SITE: PublicSiteSettings = {
  navigation: [
    { label: '首页', path: '/', visible: true },
    { label: '课程', path: '/courses', visible: true },
    { label: '试听', path: '/trials', visible: true },
    { label: '老师', path: '/teachers', visible: true },
    { label: '成长故事', path: '/stories', visible: true },
    { label: '关于', path: '/about', visible: true },
  ],
  pages: {
    courses: {
      eyebrow: '',
      title: '全部课程',
      subtitle: '按年龄与方向开设的小班课程，先预约试听，老师会电话确认适合的班型与时间。',
      seoTitle: '',
    },
    trials: {
      eyebrow: '',
      title: '公开课 / 试听课',
      subtitle: '选择一节公开课，扫码或填表即可预约名额，老师会在课前与你确认。',
      seoTitle: '',
    },
    teachers: {
      eyebrow: '',
      title: '教师团队',
      subtitle: '认识我们的老师，找到适合孩子的那一位。',
      seoTitle: '',
    },
    stories: {
      eyebrow: '',
      title: '成长故事',
      subtitle: '记录孩子从试听、练习到形成习惯的真实变化，用故事呈现课程带来的长期影响。',
      seoTitle: '',
    },
  },
  aboutPage: {
    eyebrow: '',
    title: '关于我们',
    subtitle: '',
    seoTitle: '',
    heroImageUrl: '',
    operatorIntroTitle: '',
    operatorIntro: '',
    brandCooperationTitle: '教学机构介绍',
    brandCooperation: '',
    bodyBlocks: [],
  },
  icpNumber: '',
  icpUrl: '',
};

const inputClass =
  'mt-1 w-full rounded-md border border-border/80 bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25';
const buttonClass =
  'bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition-colors hover:bg-primary/90 disabled:opacity-60';
const outlineButtonClass =
  'rounded-md border border-border/80 bg-card px-4 py-2 text-sm font-medium shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors hover:bg-muted/70 disabled:opacity-60';

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

function normalizePageCopies(value?: PublicSiteSettings['pages']): PublicSiteSettings['pages'] {
  return {
    courses: {
      ...DEFAULT_SITE.pages.courses,
      ...value?.courses,
    },
    trials: {
      ...DEFAULT_SITE.pages.trials,
      ...value?.trials,
    },
    teachers: {
      ...DEFAULT_SITE.pages.teachers,
      ...value?.teachers,
    },
    stories: {
      ...DEFAULT_SITE.pages.stories,
      ...value?.stories,
    },
  };
}

function normalizeSite(value?: PublicSiteSettings): PublicSiteSettings {
  return {
    navigation: value?.navigation?.length ? value.navigation : DEFAULT_SITE.navigation,
    pages: normalizePageCopies(value?.pages),
    aboutPage: {
      ...DEFAULT_SITE.aboutPage,
      ...value?.aboutPage,
      bodyBlocks: value?.aboutPage?.bodyBlocks ?? DEFAULT_SITE.aboutPage.bodyBlocks,
    },
    icpNumber: value?.icpNumber ?? DEFAULT_SITE.icpNumber,
    icpUrl: value?.icpUrl ?? DEFAULT_SITE.icpUrl,
  };
}

export function SettingsPage() {
  const location = useLocation();
  const isIntegrationPage = location.pathname.includes('/system/integrations');
  const [brandTab, setBrandTab] = useState<BrandTabKey>('identity');
  const [activeTab, setActiveTab] = useState<IntegrationTabKey>('payment');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [paymentItems, setPaymentItems] = useState<PaymentProviderItem[]>([]);
  const [smtpOverview, setSmtpOverview] = useState<SystemSettingOverview | null>(null);
  const [qiniuOverview, setQiniuOverview] = useState<SystemSettingOverview | null>(null);
  const [contentImportOverview, setContentImportOverview] =
    useState<ContentImportSettingsOverview | null>(null);
  const [publicSite, setPublicSite] = useState<PublicSiteSettings>(DEFAULT_SITE);

  const [org, setOrg] = useState<BrandFormState>({
    name: '',
    brandName: '',
    phone: '',
    address: '',
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
  const [contentImport, setContentImport] = useState({
    wordpressSiteUrl: '',
    wordpressUsername: '',
    wordpressAppPassword: '',
    notionApiToken: '',
  });
  const [saving, setSaving] = useState<string | null>(null);

  const wechatItem = paymentItems.find((item) => item.code === 'wechat_pay');
  const alipayItem = paymentItems.find((item) => item.code === 'alipay');

  useEffect(() => {
    if (isIntegrationPage) {
      setActiveTab('payment');
    } else {
      setBrandTab('identity');
    }
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

  function hydrateContentImport(overview: ContentImportSettingsOverview) {
    setContentImportOverview(overview);
    setContentImport((prev) => ({
      ...prev,
      wordpressSiteUrl: overview.values.wordpress.siteUrl,
      wordpressUsername: overview.values.wordpress.username,
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

  async function reloadContentImport() {
    hydrateContentImport(await fetchContentImportSettings());
  }

  useEffect(() => {
    Promise.all([
      fetchOrganization(),
      fetchPaymentSettings(),
      fetchSmtpSettings(),
      fetchContentImportSettings(),
      fetchQiniuSettings(),
    ])
      .then(([organization, payment, smtpData, contentImportData, qiniuData]) => {
        setOrg({
          name: organization.name,
          brandName: organization.brandName,
          phone: organization.phone ?? '',
          address: organization.address ?? '',
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
        setPublicSite(normalizeSite(organization.publicSite));
        hydratePayment(payment.items);
        hydrateSmtp(smtpData);
        hydrateContentImport(contentImportData);
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
        name: updated.name,
        brandName: updated.brandName,
        phone: updated.phone ?? '',
        address: updated.address ?? '',
        fullLogoUrl: updated.branding.fullLogoUrl ?? updated.branding.logoUrl ?? '',
        squareLogoUrl: updated.branding.squareLogoUrl ?? '',
        logoUrl: updated.branding.logoUrl ?? updated.branding.fullLogoUrl ?? '',
        darkLogoUrl: updated.branding.darkLogoUrl ?? '',
        faviconUrl: updated.branding.faviconUrl ?? '',
        primaryColor: updated.branding.primaryColor ?? '',
        secondaryColor: updated.branding.secondaryColor ?? '',
        backgroundColor: updated.branding.backgroundColor ?? '',
        cardColor: updated.branding.cardColor ?? '',
        textColor: updated.branding.textColor ?? '',
        headingFont: updated.branding.headingFont ?? '',
        bodyFont: updated.branding.bodyFont ?? '',
        radius: updated.branding.radius ?? '',
      }));
      notifyAdminOrganizationUpdated(updated);
      updateDocumentFavicon(updated.branding.faviconUrl);
      setMessage('品牌 VI 已保存');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(null);
    }
  }

  function updatePublicSite(patch: Partial<PublicSiteSettings>) {
    setPublicSite((current) => ({ ...current, ...patch }));
  }

  async function savePublicSitePatch(
    patch: Partial<PublicSiteSettings>,
    savingKey: string,
    successMessage: string,
  ) {
    setSaving(savingKey);
    setMessage('');
    try {
      const current = await fetchOrganization();
      const nextSite = {
        ...normalizeSite(current.publicSite),
        ...patch,
      };
      const updated = await saveOrganization({ publicSite: nextSite });
      setPublicSite(normalizeSite(updated.publicSite));
      setMessage(successMessage);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(null);
    }
  }

  async function submitNavigation(event: FormEvent) {
    event.preventDefault();
    await savePublicSitePatch(
      { navigation: publicSite.navigation },
      'navigation',
      'Header 菜单已保存',
    );
  }

  async function submitFooter(event: FormEvent) {
    event.preventDefault();
    await savePublicSitePatch(
      {
        icpNumber: publicSite.icpNumber,
        icpUrl: publicSite.icpUrl,
      },
      'footer',
      'Footer 备案已保存',
    );
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

  function contentImportPayload() {
    return {
      wordpress: {
        siteUrl: contentImport.wordpressSiteUrl,
        username: contentImport.wordpressUsername,
        ...(contentImport.wordpressAppPassword
          ? { appPassword: contentImport.wordpressAppPassword }
          : {}),
      },
      notion: {
        ...(contentImport.notionApiToken ? { apiToken: contentImport.notionApiToken } : {}),
      },
    };
  }

  async function submitContentImport(event: FormEvent) {
    event.preventDefault();
    setSaving('content-import');
    setMessage('');
    try {
      await saveContentImportSettings(contentImportPayload());
      setContentImport((prev) => ({
        ...prev,
        wordpressAppPassword: '',
        notionApiToken: '',
      }));
      await reloadContentImport();
      setMessage('内容导入配置已保存');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(null);
    }
  }

  async function testWordPressImport() {
    setSaving('content-import-wordpress-test');
    setMessage('');
    try {
      const result = await testWordPressImportSettings(contentImportPayload().wordpress);
      setMessage(
        `WordPress 连接测试通过（${result.mode === 'authenticated' ? '已认证' : '公开读取'}）`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '测试失败');
    } finally {
      setSaving(null);
    }
  }

  async function testNotionImport() {
    setSaving('content-import-notion-test');
    setMessage('');
    try {
      await testNotionImportSettings(contentImportPayload().notion);
      setMessage('Notion 连接测试通过');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '测试失败');
    } finally {
      setSaving(null);
    }
  }

  async function clearContentImport() {
    setSaving('content-import-clear');
    setMessage('');
    try {
      await clearContentImportSettings();
      setContentImport({
        wordpressSiteUrl: '',
        wordpressUsername: '',
        wordpressAppPassword: '',
        notionApiToken: '',
      });
      await reloadContentImport();
      setMessage('内容导入配置已清除');
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
    <PageFrame
      section={isIntegrationPage ? 'integrations' : 'brandSettings'}
      contentClassName="content-rail"
    >
      {isIntegrationPage ? (
        <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">
          密钥字段留空表示保持原值；支付、SMTP 和七牛云可优先读取环境变量配置。
        </div>
      ) : null}

      {message && (
        <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{message}</div>
      )}

      {loading ? (
        <div className="text-muted-foreground mt-4 text-sm">加载中...</div>
      ) : (
        <>
          {!isIntegrationPage ? (
            <>
              <AdminTabs
                tabs={brandTabs}
                activeKey={brandTab}
                onChange={(key) => setBrandTab(key as BrandTabKey)}
              />

              {brandTab === 'identity' && (
                <form className="mt-4 space-y-5 pb-24" onSubmit={submitBrand}>
                  <BrandIdentityPreview org={org} />

                  <SettingsSection
                    title="机构信息"
                    description="用于后台主体、前台品牌名、联系方式和地址展示。"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-medium">经营主体 / 机构名称</span>
                        <input
                          className={inputClass}
                          value={org.name}
                          onChange={(e) => setOrg({ ...org, name: e.target.value })}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium">前台品牌名</span>
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
                    </div>
                  </SettingsSection>

                  <SettingsSection
                    title="Logo 与站点图标"
                    description="完整 Logo 用于官网页眉；方形 Logo 用于头像、小程序和应用图标。"
                  >
                    <div className="grid gap-4 lg:grid-cols-2">
                      <QiniuImageField
                        label="完整 Logo URL"
                        hint="横版完整 logo，适合页眉/官网使用"
                        value={org.fullLogoUrl}
                        onChange={(fullLogoUrl) => setOrg({ ...org, fullLogoUrl })}
                        prefix="brand/logo"
                        previewAlt="完整 Logo"
                      />
                      <QiniuImageField
                        label="方形 Logo URL"
                        hint="方形图标，适合头像/小程序/应用图标"
                        value={org.squareLogoUrl}
                        onChange={(squareLogoUrl) => setOrg({ ...org, squareLogoUrl })}
                        prefix="brand/logo"
                        previewAlt="方形 Logo"
                      />
                      <QiniuImageField
                        label="暗色 Logo URL"
                        value={org.darkLogoUrl}
                        onChange={(darkLogoUrl) => setOrg({ ...org, darkLogoUrl })}
                        prefix="brand/logo"
                        previewAlt="暗色 Logo"
                      />
                      <QiniuImageField
                        label="兼容 Logo URL"
                        hint="历史字段；为空时保存完整 Logo"
                        value={org.logoUrl}
                        onChange={(logoUrl) => setOrg({ ...org, logoUrl })}
                        prefix="brand/logo"
                        previewAlt="兼容 Logo"
                      />
                      <QiniuImageField
                        label="Favicon URL"
                        value={org.faviconUrl}
                        onChange={(faviconUrl) => setOrg({ ...org, faviconUrl })}
                        prefix="brand/favicon"
                        previewAlt="Favicon"
                      />
                    </div>
                  </SettingsSection>

                  <SettingsSection
                    title="颜色、字体与圆角"
                    description="这些值会作为品牌视觉 token，保存后同步影响后台界面和前台页面。"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ColorInput
                        label="主色"
                        value={org.primaryColor}
                        placeholder="#9a6a4b"
                        onChange={(primaryColor) => setOrg({ ...org, primaryColor })}
                      />
                      <ColorInput
                        label="辅助色"
                        value={org.secondaryColor}
                        placeholder="#211f1c"
                        onChange={(secondaryColor) => setOrg({ ...org, secondaryColor })}
                      />
                      <ColorInput
                        label="背景色"
                        value={org.backgroundColor}
                        placeholder="#f6f4f0"
                        onChange={(backgroundColor) => setOrg({ ...org, backgroundColor })}
                      />
                      <ColorInput
                        label="卡片色"
                        value={org.cardColor}
                        placeholder="#ffffff"
                        onChange={(cardColor) => setOrg({ ...org, cardColor })}
                      />
                      <ColorInput
                        label="文字色"
                        value={org.textColor}
                        placeholder="#211f1c"
                        onChange={(textColor) => setOrg({ ...org, textColor })}
                      />
                      <label className="block">
                        <span className="text-sm font-medium">圆角</span>
                        <input
                          className={inputClass}
                          placeholder="18px"
                          value={org.radius}
                          onChange={(e) => setOrg({ ...org, radius: e.target.value })}
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
                    </div>
                  </SettingsSection>

                  <FloatingSubmitBar
                    title="基础 VI"
                    label={saving === 'brand' ? '保存中...' : '保存品牌 VI'}
                    disabled={saving === 'brand'}
                  />
                </form>
              )}

              {brandTab === 'navigation' && (
                <form className="mt-4 space-y-5 pb-24" onSubmit={submitNavigation}>
                  <SettingsSection
                    title="前台 Header 菜单"
                    description="按展示顺序维护前台页眉导航；关闭显示后该菜单不会出现在前台。"
                  >
                    <NavEditor
                      value={publicSite.navigation}
                      onChange={(navigation) => updatePublicSite({ navigation })}
                    />
                  </SettingsSection>
                  <FloatingSubmitBar
                    title="Header 菜单"
                    label={saving === 'navigation' ? '保存中...' : '保存 Header 菜单'}
                    disabled={saving === 'navigation'}
                  />
                </form>
              )}

              {brandTab === 'footer' && (
                <form className="mt-4 space-y-5 pb-24" onSubmit={submitFooter}>
                  <SettingsSection
                    title="Footer / 备案"
                    description="用于前台页面底部的备案号和备案系统跳转链接。"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="备案号">
                        <input
                          className="form-input"
                          placeholder="例如：沪ICP备00000000号-1"
                          value={publicSite.icpNumber}
                          onChange={(event) => updatePublicSite({ icpNumber: event.target.value })}
                        />
                      </Field>
                      <Field label="备案链接">
                        <input
                          className="form-input"
                          placeholder="https://beian.miit.gov.cn"
                          value={publicSite.icpUrl}
                          onChange={(event) => updatePublicSite({ icpUrl: event.target.value })}
                        />
                      </Field>
                    </div>
                  </SettingsSection>
                  <FloatingSubmitBar
                    title="Footer 备案"
                    label={saving === 'footer' ? '保存中...' : '保存 Footer 备案'}
                    disabled={saving === 'footer'}
                  />
                </form>
              )}
            </>
          ) : (
            <>
              <AdminTabs
                tabs={integrationTabs}
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as IntegrationTabKey)}
              />

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
                          {alipayItem?.secrets.privateKeyPem?.configured
                            ? '（已配置，留空不变）'
                            : ''}
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
                          {alipayItem?.secrets.publicKeyPem?.configured
                            ? '（已配置，留空不变）'
                            : ''}
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

              {activeTab === 'contentImport' && (
                <form className="resource-card mt-4 p-5" onSubmit={submitContentImport}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">内容导入</span>
                      <StatusBadge configured={Boolean(contentImportOverview?.configured)} />
                    </div>
                    <SourceLabel source={contentImportOverview?.source} />
                  </div>
                  <div className="mt-4 grid gap-5 lg:grid-cols-2">
                    <section className="rounded-lg border p-4">
                      <div className="text-sm font-semibold">WordPress</div>
                      <div className="mt-3 grid gap-3">
                        <label className="block">
                          <span className="text-sm font-medium">站点地址</span>
                          <input
                            className={inputClass}
                            placeholder="https://your-site.com"
                            value={contentImport.wordpressSiteUrl}
                            onChange={(e) =>
                              setContentImport({
                                ...contentImport,
                                wordpressSiteUrl: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium">用户名</span>
                          <input
                            className={inputClass}
                            value={contentImport.wordpressUsername}
                            onChange={(e) =>
                              setContentImport({
                                ...contentImport,
                                wordpressUsername: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium">应用密码</span>
                          <input
                            className={inputClass}
                            type="password"
                            placeholder={
                              contentImportOverview?.secrets.wordpress.appPassword.configured
                                ? '已配置（留空不变）'
                                : ''
                            }
                            value={contentImport.wordpressAppPassword}
                            onChange={(e) =>
                              setContentImport({
                                ...contentImport,
                                wordpressAppPassword: e.target.value,
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className={outlineButtonClass}
                          disabled={saving === 'content-import-wordpress-test'}
                          onClick={testWordPressImport}
                        >
                          测试 WordPress
                        </button>
                      </div>
                    </section>

                    <section className="rounded-lg border p-4">
                      <div className="text-sm font-semibold">Notion</div>
                      <div className="mt-3 grid gap-3">
                        <label className="block">
                          <span className="text-sm font-medium">Integration Token</span>
                          <input
                            className={inputClass}
                            type="password"
                            placeholder={
                              contentImportOverview?.secrets.notion.apiToken.configured
                                ? '已配置（留空不变）'
                                : ''
                            }
                            value={contentImport.notionApiToken}
                            onChange={(e) =>
                              setContentImport({
                                ...contentImport,
                                notionApiToken: e.target.value,
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className={outlineButtonClass}
                          disabled={saving === 'content-import-notion-test'}
                          onClick={testNotionImport}
                        >
                          测试 Notion
                        </button>
                      </div>
                    </section>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className={buttonClass} disabled={saving === 'content-import'}>
                      {saving === 'content-import' ? '保存中...' : '保存内容导入配置'}
                    </button>
                    <button
                      type="button"
                      className={outlineButtonClass}
                      disabled={saving === 'content-import-clear'}
                      onClick={clearContentImport}
                    >
                      清除配置
                    </button>
                  </div>
                </form>
              )}

              {activeTab === 'qiniu' && (
                <div className="mt-4 grid gap-4">
                  <form className="resource-card p-5" onSubmit={submitQiniu}>
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

                  <QiniuMediaLibrary />
                </div>
              )}
            </>
          )}
        </>
      )}
    </PageFrame>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="resource-card overflow-hidden p-0">
      <div className="border-b px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? (
          <p className="text-muted-foreground mt-1 text-sm leading-5">{description}</p>
        ) : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function BrandIdentityPreview({ org }: { org: BrandFormState }) {
  const brandName = displayValue(org.brandName || org.name, '未设置品牌名');
  const backgroundColor = colorValue(org.backgroundColor, '#f6f4f0');
  const cardColor = colorValue(org.cardColor, '#ffffff');
  const primaryColor = colorValue(org.primaryColor, '#9a6a4b');
  const textColor = colorValue(org.textColor, '#211f1c');
  const secondaryColor = colorValue(org.secondaryColor, '#211f1c');
  const logoUrl = org.fullLogoUrl || org.squareLogoUrl || org.logoUrl;

  return (
    <section className="resource-card overflow-hidden p-0">
      <div className="border-b px-5 py-4">
        <div className="text-primary text-xs font-semibold">当前 VI</div>
        <h2 className="mt-1 text-base font-semibold">品牌视觉预览</h2>
        <p className="text-muted-foreground mt-1 text-sm leading-5">
          当前颜色值、字体、圆角和 Logo 会在这里同步展示。
        </p>
      </div>
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div
          className="rounded-xl border p-4"
          style={{
            backgroundColor,
            color: textColor,
            borderRadius: org.radius || '18px',
            fontFamily: org.bodyFont || undefined,
          }}
        >
          <div
            className="rounded-lg border p-4 shadow-sm"
            style={{ backgroundColor: cardColor, borderRadius: org.radius || '14px' }}
          >
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={brandName}
                  className="h-12 w-12 rounded-lg border object-contain"
                />
              ) : (
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg text-sm font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {brandName.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0">
                <div
                  className="truncate text-lg font-semibold"
                  style={{ fontFamily: org.headingFont || undefined }}
                >
                  {brandName}
                </div>
                <div className="mt-1 truncate text-xs opacity-70">
                  {displayValue(org.address, '地址未设置')}
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                style={{ backgroundColor: primaryColor }}
              >
                主色按钮
              </span>
              <span
                className="rounded-full border px-3 py-1 text-xs font-semibold"
                style={{ borderColor: secondaryColor, color: secondaryColor }}
              >
                辅助按钮
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {BRAND_COLOR_FIELDS.map((item) => (
            <BrandColorValue
              key={item.key}
              label={item.label}
              value={org[item.key]}
              fallback={item.fallback}
            />
          ))}
          <ValueChip label="标题字体" value={displayValue(org.headingFont, '默认字体')} />
          <ValueChip label="正文字体" value={displayValue(org.bodyFont, '默认字体')} />
          <ValueChip label="圆角" value={displayValue(org.radius, '默认圆角')} />
          <ValueChip label="联系电话" value={displayValue(org.phone, '未设置')} />
        </div>
      </div>
    </section>
  );
}

function BrandColorValue({
  label,
  value,
  fallback,
}: {
  label: string;
  value: string;
  fallback: string;
}) {
  const resolved = colorValue(value, fallback);
  return (
    <div className="bg-card rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span
          className="h-7 w-7 shrink-0 rounded-full border"
          style={{ backgroundColor: resolved }}
          aria-hidden="true"
        />
      </div>
      <div className="text-muted-foreground mt-2 font-mono text-xs">{resolved}</div>
    </div>
  );
}

function ValueChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-lg border p-3">
      <div className="text-sm font-medium">{label}</div>
      <div className="text-muted-foreground mt-2 text-xs break-words">{value}</div>
    </div>
  );
}

function ColorInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const resolved = colorValue(value, placeholder);
  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground font-mono text-xs">{resolved}</span>
      </div>
      <div className="bg-background mt-1 flex items-center rounded-lg border">
        <span
          className="ml-2 h-7 w-7 shrink-0 rounded-md border"
          style={{ backgroundColor: resolved }}
          aria-hidden="true"
        />
        <input
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  );
}

function FloatingSubmitBar({
  title,
  label,
  disabled,
}: {
  title: string;
  label: string;
  disabled: boolean;
}) {
  return (
    <div className="bg-card/95 fixed right-4 bottom-4 z-40 flex w-[calc(100vw-2rem)] max-w-sm items-center justify-between gap-3 rounded-xl border p-3 shadow-xl backdrop-blur md:right-8">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{title}</div>
        <div className="text-muted-foreground text-xs">当前 tab</div>
      </div>
      <button className={`${buttonClass} shrink-0`} disabled={disabled}>
        {label}
      </button>
    </div>
  );
}

function displayValue(value: string, fallback: string) {
  return value.trim() || fallback;
}

function colorValue(value: string, fallback: string) {
  return value.trim() || fallback;
}

function NavEditor({
  value,
  onChange,
}: {
  value: PublicNavItem[];
  onChange: (value: PublicNavItem[]) => void;
}) {
  function patch(index: number, partial: Partial<PublicNavItem>) {
    onChange(
      value.map((item, itemIndex) => (itemIndex === index ? { ...item, ...partial } : item)),
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = value.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {value.map((item, index) => (
        <div key={index} className="rounded-lg border p-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] md:items-end">
            <Field label="菜单名称">
              <input
                className="form-input"
                value={item.label}
                onChange={(event) => patch(index, { label: event.target.value })}
              />
            </Field>
            <Field label="链接">
              <input
                className="form-input"
                value={item.path}
                onChange={(event) => patch(index, { path: event.target.value })}
              />
            </Field>
            <div className="mb-3.5 flex items-center gap-1">
              <button
                type="button"
                className="btn btn-ghost px-2"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label="上移菜单"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="btn btn-ghost px-2"
                onClick={() => move(index, 1)}
                disabled={index === value.length - 1}
                aria-label="下移菜单"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="btn btn-ghost px-2 text-red-600"
                onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
                aria-label="删除菜单"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={item.visible}
              onChange={(event) => patch(index, { visible: event.target.checked })}
            />
            在前台 Header 显示
          </label>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-secondary w-full"
        onClick={() => onChange([...value, { label: '新菜单', path: '/', visible: true }])}
      >
        <Plus className="h-4 w-4" />
        添加菜单项
      </button>
    </div>
  );
}
