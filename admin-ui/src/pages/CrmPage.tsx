import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightCircle,
  CalendarCheck,
  ClipboardCheck,
  ListFilter,
  Plus,
  QrCode,
  Share2,
} from 'lucide-react';

import { api, apiPatch, apiPost } from '@/api/client';
import type {
  Campaign,
  CampaignFunnelRow,
  Channel,
  ChannelFunnelRow,
  Course,
  FollowUp,
  Lead,
  LeadStatus,
  TrialSession,
} from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { MetricCard } from '@/components/shared/MetricCard';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';
import { formatDateTime } from '@/lib/utils';

const CRM_BASE = '/v1/crm';
const LEADS = `${CRM_BASE}/leads`;
const CHANNELS = `${CRM_BASE}/channels`;
const CAMPAIGNS = `${CRM_BASE}/campaigns`;

const statusOptions: LeadStatus[] = [
  'new',
  'contacted',
  'follow_up',
  'trial_booked',
  'trial_attended',
  'paid',
  'invalid',
];

const statusLabels: Record<LeadStatus, string> = {
  new: '待联系',
  contacted: '已联系',
  trial_booked: '已约试听',
  trial_attended: '已到店',
  paid: '已成交',
  follow_up: '跟进中',
  invalid: '无效',
};

const flowStages: Array<{ key: LeadStatus; label: string }> = [
  { key: 'new', label: '留资线索' },
  { key: 'contacted', label: '已联系' },
  { key: 'trial_booked', label: '试听预约' },
  { key: 'trial_attended', label: '到店核销' },
  { key: 'paid', label: '成交签约' },
];

const pct = (rate: number) => `${(rate * 100).toFixed(1)}%`;

function displayStatus(status: LeadStatus) {
  return statusLabels[status] ?? status;
}

function emptyReferralForm() {
  return {
    guardianName: '',
    phone: '',
    studentName: '',
    grade: '',
    campaign: '',
  };
}

export function CrmPage() {
  const toast = useToast();
  const { data: leads, setData: setLeads } = useApiResource<Lead>(LEADS, 'leads');
  const { data: channels, setData: setChannels } = useApiResource<Channel>(CHANNELS, 'channels');
  const { data: campaigns, setData: setCampaigns } = useApiResource<Campaign>(
    CAMPAIGNS,
    'campaigns',
  );
  const { data: courses } = useApiResource<Course>('/v1/courses', 'courses');
  const { data: trialSessions } = useApiResource<TrialSession>(
    '/v1/trial-sessions',
    'trialSessions',
  );
  const [view, setView] = useState<'leads' | 'campaigns' | 'channels' | 'funnel'>('leads');
  const [campaignFunnel, setCampaignFunnel] = useState<CampaignFunnelRow[]>([]);
  const [channelFunnel, setChannelFunnel] = useState<ChannelFunnelRow[]>([]);

  useEffect(() => {
    api<{ byCampaign: CampaignFunnelRow[]; byChannel: ChannelFunnelRow[] }>('/v1/reports/funnel')
      .then((payload) => {
        setCampaignFunnel(payload.byCampaign ?? []);
        setChannelFunnel(payload.byChannel ?? []);
      })
      .catch(() => {
        setCampaignFunnel([]);
        setChannelFunnel([]);
      });
  }, [leads.length, campaigns.length, channels.length]);

  const channelMap = useMemo(
    () => new Map(channels.map((item) => [item.id, item.name])),
    [channels],
  );
  const campaignMap = useMemo(
    () => new Map(campaigns.map((item) => [item.id, item.name])),
    [campaigns],
  );
  const openTrialSessions = useMemo(
    () => trialSessions.filter((session) => session.status === 'open'),
    [trialSessions],
  );

  const metrics = useMemo(() => {
    const count = (status: LeadStatus) => leads.filter((lead) => lead.status === status).length;
    const paid = count('paid');
    const activeCampaigns = campaigns.filter((campaign) => campaign.status === 'active').length;
    return {
      total: leads.length,
      activeCampaigns,
      pending: count('new') + count('follow_up'),
      booked: count('trial_booked'),
      attended: count('trial_attended'),
      paid,
      conversionRate: leads.length > 0 ? pct(paid / leads.length) : '0.0%',
    };
  }, [campaigns, leads]);

  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [query, setQuery] = useState('');

  const filteredLeads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
      if (channelFilter !== 'all' && lead.channelId !== channelFilter) return false;
      if (campaignFilter !== 'all' && lead.campaignId !== campaignFilter) return false;
      if (!normalizedQuery) return true;
      return (
        lead.studentName.toLowerCase().includes(normalizedQuery) ||
        lead.guardianName.toLowerCase().includes(normalizedQuery) ||
        lead.phone.includes(normalizedQuery) ||
        lead.source.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [campaignFilter, channelFilter, leads, query, statusFilter]);

  const [channelOpen, setChannelOpen] = useState(false);
  const [channelEditing, setChannelEditing] = useState<Channel | null>(null);
  const [channelForm, setChannelForm] = useState({ code: '', name: '' });
  const [savingChannel, setSavingChannel] = useState(false);

  function openChannel(channel?: Channel) {
    setChannelEditing(channel ?? null);
    setChannelForm(channel ? { code: channel.code, name: channel.name } : { code: '', name: '' });
    setChannelOpen(true);
  }

  async function submitChannel() {
    if (!channelForm.code.trim() || !channelForm.name.trim()) {
      toast.error('渠道 code 和名称必填');
      return;
    }
    setSavingChannel(true);
    try {
      if (channelEditing) {
        const { channel } = await apiPatch<{ channel: Channel }>(
          `${CHANNELS}/${channelEditing.id}`,
          channelForm,
        );
        setChannels(channels.map((item) => (item.id === channel.id ? channel : item)));
      } else {
        const { channel } = await apiPost<{ channel: Channel }>(CHANNELS, channelForm);
        setChannels([channel, ...channels]);
      }
      setChannelOpen(false);
      toast.success('渠道已保存');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingChannel(false);
    }
  }

  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignEditing, setCampaignEditing] = useState<Campaign | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    channelId: '',
    code: '',
    name: '',
    courseSlug: '',
    medium: 'qr_code',
    status: 'active',
  });
  const [savingCampaign, setSavingCampaign] = useState(false);

  function openCampaign(campaign?: Campaign) {
    setCampaignEditing(campaign ?? null);
    setCampaignForm(
      campaign
        ? {
            channelId: campaign.channelId,
            code: campaign.code,
            name: campaign.name,
            courseSlug: campaign.courseSlug ?? '',
            medium: campaign.medium,
            status: campaign.status,
          }
        : {
            channelId: channels[0]?.id ?? '',
            code: '',
            name: '',
            courseSlug: '',
            medium: 'qr_code',
            status: 'active',
          },
    );
    setCampaignOpen(true);
  }

  async function submitCampaign() {
    if (!campaignForm.channelId) {
      toast.error('请先选择渠道');
      return;
    }
    if (!campaignForm.code.trim() || !campaignForm.name.trim()) {
      toast.error('活动 code 和名称必填');
      return;
    }
    setSavingCampaign(true);
    try {
      const payload = { ...campaignForm, courseSlug: campaignForm.courseSlug || undefined };
      if (campaignEditing) {
        const { campaign } = await apiPatch<{ campaign: Campaign }>(
          `${CAMPAIGNS}/${campaignEditing.id}`,
          payload,
        );
        setCampaigns(campaigns.map((item) => (item.id === campaign.id ? campaign : item)));
      } else {
        const { campaign } = await apiPost<{ campaign: Campaign }>(CAMPAIGNS, payload);
        setCampaigns([campaign, ...campaigns]);
      }
      setCampaignOpen(false);
      toast.success('活动已保存');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingCampaign(false);
    }
  }

  const [qrCampaign, setQrCampaign] = useState<Campaign | null>(null);
  const [qr, setQr] = useState<{ landingUrl: string; qrCodeDataUrl: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  async function openQr(campaign: Campaign) {
    setQrCampaign(campaign);
    setQr(null);
    setQrLoading(true);
    try {
      const payload = await api<{ landingUrl: string; qrCodeDataUrl: string }>(
        `${CAMPAIGNS}/${campaign.id}/qrcode`,
      );
      setQr(payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成二维码失败');
    } finally {
      setQrLoading(false);
    }
  }

  async function copyLanding() {
    if (!qr) return;
    try {
      await navigator.clipboard.writeText(qr.landingUrl);
      toast.success('落地链接已复制');
    } catch {
      toast.error('复制失败，请手动选择');
    }
  }

  const [selected, setSelected] = useState<Lead | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loadingFollowUps, setLoadingFollowUps] = useState(false);
  const [followUpText, setFollowUpText] = useState('');
  const [nextAt, setNextAt] = useState('');
  const [trialSessionId, setTrialSessionId] = useState('');
  const [trialFeedback, setTrialFeedback] = useState('');
  const [convertSchool, setConvertSchool] = useState('');
  const [referralForm, setReferralForm] = useState(emptyReferralForm());
  const [submittingAction, setSubmittingAction] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setLoadingFollowUps(true);
    setFollowUps([]);
    setTrialSessionId(selected.trialSessionId ?? openTrialSessions[0]?.id ?? '');
    api<{ followUps: FollowUp[] }>(`${LEADS}/${selected.id}/follow-ups`)
      .then((payload) => setFollowUps(payload.followUps))
      .catch(() => setFollowUps([]))
      .finally(() => setLoadingFollowUps(false));
  }, [openTrialSessions, selected]);

  function patchLead(updated: Lead) {
    setLeads(leads.map((item) => (item.id === updated.id ? updated : item)));
    setSelected((current) => (current && current.id === updated.id ? updated : current));
  }

  async function updateStatus(lead: Lead, status: LeadStatus) {
    try {
      const { lead: updated } = await api<{ lead: Lead }>(`${LEADS}/${lead.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      patchLead(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    }
  }

  async function submitFollowUp() {
    if (!selected || !followUpText.trim()) {
      toast.error('请填写跟进内容');
      return;
    }
    setSubmittingAction(true);
    try {
      const body: { content: string; nextFollowUpAt?: string } = { content: followUpText.trim() };
      if (nextAt) body.nextFollowUpAt = new Date(nextAt).toISOString();
      const { followUp, lead } = await apiPost<{ followUp: FollowUp; lead: Lead }>(
        `${LEADS}/${selected.id}/follow-ups`,
        body,
      );
      setFollowUps([followUp, ...followUps]);
      patchLead(lead);
      setFollowUpText('');
      setNextAt('');
      toast.success('跟进已记录');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmittingAction(false);
    }
  }

  async function bookTrial() {
    if (!selected || !trialSessionId) {
      toast.error('请选择试听场次');
      return;
    }
    setSubmittingAction(true);
    try {
      const { lead } = await apiPost<{ lead: Lead }>(`${LEADS}/${selected.id}/trial-booking`, {
        trialSessionId,
      });
      patchLead(lead);
      toast.success('已预约试听');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '预约失败');
    } finally {
      setSubmittingAction(false);
    }
  }

  async function checkInTrial() {
    if (!selected) return;
    setSubmittingAction(true);
    try {
      const body: { feedback?: string; nextFollowUpAt?: string } = {};
      if (trialFeedback.trim()) body.feedback = trialFeedback.trim();
      if (nextAt) body.nextFollowUpAt = new Date(nextAt).toISOString();
      const { followUp, lead } = await apiPost<{ followUp: FollowUp; lead: Lead }>(
        `${LEADS}/${selected.id}/trial-check-in`,
        body,
      );
      setFollowUps([followUp, ...followUps]);
      patchLead(lead);
      setTrialFeedback('');
      toast.success('已核销试听到店');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '核销失败');
    } finally {
      setSubmittingAction(false);
    }
  }

  async function contractLead() {
    if (!selected) return;
    setSubmittingAction(true);
    try {
      const { lead } = await apiPost<{ lead: Lead }>(`${LEADS}/${selected.id}/contract`, {
        school: convertSchool || undefined,
      });
      patchLead(lead);
      setConvertSchool('');
      toast.success('已成交签约');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '签约失败');
    } finally {
      setSubmittingAction(false);
    }
  }

  async function createReferral() {
    if (!selected) return;
    if (
      !referralForm.guardianName.trim() ||
      !referralForm.phone.trim() ||
      !referralForm.studentName.trim() ||
      !referralForm.grade.trim()
    ) {
      toast.error('请填写推荐线索信息');
      return;
    }
    setSubmittingAction(true);
    try {
      const { lead } = await apiPost<{ lead: Lead }>(`${LEADS}/${selected.id}/referrals`, {
        ...referralForm,
        campaign: referralForm.campaign || undefined,
      });
      setLeads([lead, ...leads]);
      setReferralForm(emptyReferralForm());
      toast.success('推荐线索已创建');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmittingAction(false);
    }
  }

  return (
    <PageFrame
      section="crm"
      actions={
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => openChannel()}>
            <Plus className="h-4 w-4" />
            新建渠道
          </button>
          <button type="button" className="btn btn-primary" onClick={() => openCampaign()}>
            <Plus className="h-4 w-4" />
            新建活动
          </button>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="总线索" value={metrics.total} hint="活动参与后形成" />
        <MetricCard label="活动中" value={metrics.activeCampaigns} hint="可继续获客" />
        <MetricCard label="待跟进" value={metrics.pending} hint="新线索与跟进中" />
        <MetricCard label="试听预约" value={metrics.booked} hint="已锁定到店场次" />
        <MetricCard label="到店体验" value={metrics.attended} hint="已核销试听" />
        <MetricCard label="成交率" value={metrics.conversionRate} hint={`${metrics.paid} 个成交`} />
      </div>

      <section className="resource-card mt-4 p-4">
        <div className="grid gap-3 md:grid-cols-5">
          {flowStages.map((stage, index) => (
            <div key={stage.key} className="rounded-lg border bg-white p-3">
              <div className="text-muted-foreground text-xs">
                {index + 1}. {stage.label}
              </div>
              <div className="mt-1 text-xl font-semibold">
                {leads.filter((lead) => lead.status === stage.key).length}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            ['leads', '线索跟进'],
            ['campaigns', '活动投放'],
            ['channels', '渠道管理'],
            ['funnel', '转化漏斗'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={view === key ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => setView(key as typeof view)}
            >
              {label}
            </button>
          ))}
        </div>
        {view === 'leads' && (
          <div className="flex flex-wrap items-center gap-2">
            <ListFilter className="text-muted-foreground h-4 w-4" />
            <select
              className="form-input w-auto py-1.5"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | LeadStatus)}
            >
              <option value="all">全部状态</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {displayStatus(status)}
                </option>
              ))}
            </select>
            <select
              className="form-input w-auto py-1.5"
              value={channelFilter}
              onChange={(event) => setChannelFilter(event.target.value)}
            >
              <option value="all">全部渠道</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
            <select
              className="form-input w-auto py-1.5"
              value={campaignFilter}
              onChange={(event) => setCampaignFilter(event.target.value)}
            >
              <option value="all">全部活动</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
            <input
              className="form-input w-48 py-1.5"
              placeholder="搜索姓名/手机/来源"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        )}
      </div>

      {view === 'leads' && (
        <div className="mt-3">
          <DataTable
            columns={[
              {
                key: 'student',
                header: '线索',
                cell: (row) => (
                  <button
                    type="button"
                    className="cell-stack text-left"
                    onClick={() => setSelected(row)}
                  >
                    <span className="cell-title text-primary">{row.studentName}</span>
                    <span className="cell-subtitle">
                      {row.guardianName} · {row.phone}
                    </span>
                  </button>
                ),
              },
              { key: 'grade', header: '年级', cell: (row) => row.grade },
              {
                key: 'source',
                header: '活动来源',
                cell: (row) => (
                  <div className="cell-stack">
                    <span className="cell-title">
                      {campaignMap.get(row.campaignId ?? '') ?? row.source}
                    </span>
                    <span className="cell-subtitle">
                      {channelMap.get(row.channelId ?? '') ?? '未归因'}
                    </span>
                  </div>
                ),
              },
              {
                key: 'status',
                header: '阶段',
                cell: (row) => (
                  <StatusPill tone={statusToTone(row.status)} label={displayStatus(row.status)} />
                ),
              },
              {
                key: 'next',
                header: '下次跟进',
                cell: (row) => (row.nextFollowUpAt ? formatDateTime(row.nextFollowUpAt) : '—'),
              },
              {
                key: 'action',
                header: '流转',
                cell: (row) => (
                  <select
                    className="form-input w-auto py-1"
                    value={row.status}
                    onChange={(event) => updateStatus(row, event.target.value as LeadStatus)}
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {displayStatus(status)}
                      </option>
                    ))}
                  </select>
                ),
              },
            ]}
            data={filteredLeads}
          />
        </div>
      )}

      {view === 'campaigns' && (
        <div className="mt-3">
          <DataTable
            columns={[
              {
                key: 'name',
                header: '活动',
                cell: (row) => (
                  <div className="cell-stack">
                    <span className="cell-title">{row.name}</span>
                    <span className="cell-subtitle">
                      {channelMap.get(row.channelId) ?? '—'} · <code>{row.code}</code>
                    </span>
                  </div>
                ),
              },
              { key: 'course', header: '关联课程', cell: (row) => row.courseSlug ?? '首页' },
              { key: 'medium', header: '触点', cell: (row) => row.medium },
              {
                key: 'status',
                header: '状态',
                cell: (row) => <StatusPill tone={statusToTone(row.status)} label={row.status} />,
              },
              {
                key: 'actions',
                header: '操作',
                cell: (row) => (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="btn btn-ghost px-2 py-1"
                      onClick={() => openQr(row)}
                    >
                      <QrCode className="h-3.5 w-3.5" />
                      二维码
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost px-2 py-1"
                      onClick={() => openCampaign(row)}
                    >
                      编辑
                    </button>
                  </div>
                ),
              },
            ]}
            data={campaigns}
            emptyMessage="还没有活动，先创建活动再生成线索。"
          />
        </div>
      )}

      {view === 'channels' && (
        <div className="mt-3">
          <DataTable
            columns={[
              { key: 'name', header: '渠道', cell: (row) => row.name },
              { key: 'code', header: '参数 code', cell: (row) => <code>{row.code}</code> },
              {
                key: 'actions',
                header: '操作',
                cell: (row) => (
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1"
                    onClick={() => openChannel(row)}
                  >
                    编辑
                  </button>
                ),
              },
            ]}
            data={channels}
            emptyMessage="还没有渠道，先新建一个获客渠道。"
          />
        </div>
      )}

      {view === 'funnel' && (
        <div className="mt-3 space-y-6">
          <DataTable
            columns={[
              {
                key: 'name',
                header: '渠道',
                cell: (row) => (
                  <div className="cell-stack">
                    <span className="cell-title">{row.name}</span>
                    <span className="cell-subtitle">
                      <code>{row.code}</code>
                    </span>
                  </div>
                ),
              },
              { key: 'total', header: '线索', cell: (row) => row.total },
              { key: 'trialBooked', header: '约试听', cell: (row) => row.trialBooked },
              { key: 'trialAttended', header: '到店', cell: (row) => row.trialAttended },
              { key: 'paid', header: '成交', cell: (row) => row.paid },
              { key: 'rate', header: '成交率', cell: (row) => pct(row.conversionRate) },
            ]}
            data={channelFunnel}
            emptyMessage="暂无渠道归因数据"
          />
          <DataTable
            columns={[
              {
                key: 'name',
                header: '活动',
                cell: (row) => (
                  <div className="cell-stack">
                    <span className="cell-title">{row.name}</span>
                    <span className="cell-subtitle">{row.channelName ?? '—'}</span>
                  </div>
                ),
              },
              { key: 'total', header: '线索', cell: (row) => row.total },
              { key: 'trialBooked', header: '约试听', cell: (row) => row.trialBooked },
              { key: 'trialAttended', header: '到店', cell: (row) => row.trialAttended },
              { key: 'paid', header: '成交', cell: (row) => row.paid },
              { key: 'rate', header: '成交率', cell: (row) => pct(row.conversionRate) },
            ]}
            data={campaignFunnel}
            emptyMessage="暂无活动归因数据"
          />
        </div>
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? selected.studentName : ''}
        description={selected ? `${selected.guardianName} · ${selected.phone}` : ''}
      >
        {selected && (
          <div className="space-y-5">
            <section className="resource-card p-4">
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-muted-foreground">年级</span>
                <span>{selected.grade}</span>
                <span className="text-muted-foreground">渠道</span>
                <span>{channelMap.get(selected.channelId ?? '') ?? '—'}</span>
                <span className="text-muted-foreground">活动</span>
                <span>{campaignMap.get(selected.campaignId ?? '') ?? '—'}</span>
                <span className="text-muted-foreground">触点</span>
                <span>{selected.medium ?? '—'}</span>
                <span className="text-muted-foreground">阶段</span>
                <span>
                  <StatusPill
                    tone={statusToTone(selected.status)}
                    label={displayStatus(selected.status)}
                  />
                </span>
              </div>
            </section>

            <section className="resource-card p-4">
              <h3 className="mb-3 text-sm font-semibold">跟进联系</h3>
              <textarea
                className="form-input h-20"
                placeholder="记录本次沟通内容"
                value={followUpText}
                onChange={(event) => setFollowUpText(event.target.value)}
              />
              <div className="mt-2 flex items-end gap-2">
                <Field label="下次跟进时间">
                  <input
                    className="form-input"
                    type="datetime-local"
                    value={nextAt}
                    onChange={(event) => setNextAt(event.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="btn btn-primary mb-3.5 shrink-0"
                  onClick={submitFollowUp}
                  disabled={submittingAction}
                >
                  记录跟进
                </button>
              </div>
            </section>

            <section className="resource-card p-4">
              <h3 className="mb-3 text-sm font-semibold">试听预约 / 到店核销</h3>
              <Field label="试听场次">
                <select
                  className="form-input"
                  value={trialSessionId}
                  onChange={(event) => setTrialSessionId(event.target.value)}
                >
                  <option value="">选择试听场次</option>
                  {openTrialSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.title} · {formatDateTime(session.startsAt)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary flex-1"
                  onClick={bookTrial}
                  disabled={submittingAction}
                >
                  <CalendarCheck className="h-4 w-4" />
                  预约试听
                </button>
                <button
                  type="button"
                  className="btn btn-primary flex-1"
                  onClick={checkInTrial}
                  disabled={submittingAction}
                >
                  <ClipboardCheck className="h-4 w-4" />
                  到店核销
                </button>
              </div>
              <textarea
                className="form-input h-20"
                placeholder="试听体验反馈"
                value={trialFeedback}
                onChange={(event) => setTrialFeedback(event.target.value)}
              />
            </section>

            {selected.convertedStudentId ? (
              <section className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                已成交签约，可继续记录课堂体验或创建推荐线索。
              </section>
            ) : (
              <section className="resource-card p-4">
                <h3 className="mb-3 text-sm font-semibold">成交签约</h3>
                <Field label="学校">
                  <input
                    className="form-input"
                    value={convertSchool}
                    onChange={(event) => setConvertSchool(event.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="btn btn-primary w-full"
                  onClick={contractLead}
                  disabled={submittingAction}
                >
                  <ArrowRightCircle className="h-4 w-4" />
                  成交签约
                </button>
              </section>
            )}

            <section className="resource-card p-4">
              <h3 className="mb-3 text-sm font-semibold">推荐分享转化</h3>
              <FieldRow>
                <Field label="推荐家长" required>
                  <input
                    className="form-input"
                    value={referralForm.guardianName}
                    onChange={(event) =>
                      setReferralForm({ ...referralForm, guardianName: event.target.value })
                    }
                  />
                </Field>
                <Field label="手机号" required>
                  <input
                    className="form-input"
                    value={referralForm.phone}
                    onChange={(event) =>
                      setReferralForm({ ...referralForm, phone: event.target.value })
                    }
                  />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="孩子姓名" required>
                  <input
                    className="form-input"
                    value={referralForm.studentName}
                    onChange={(event) =>
                      setReferralForm({ ...referralForm, studentName: event.target.value })
                    }
                  />
                </Field>
                <Field label="年级" required>
                  <input
                    className="form-input"
                    value={referralForm.grade}
                    onChange={(event) =>
                      setReferralForm({ ...referralForm, grade: event.target.value })
                    }
                  />
                </Field>
              </FieldRow>
              <Field label="归因活动">
                <select
                  className="form-input"
                  value={referralForm.campaign}
                  onChange={(event) =>
                    setReferralForm({ ...referralForm, campaign: event.target.value })
                  }
                >
                  <option value="">推荐分享</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.code}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                type="button"
                className="btn btn-secondary w-full"
                onClick={createReferral}
                disabled={submittingAction}
              >
                <Share2 className="h-4 w-4" />
                创建推荐线索
              </button>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">跟进时间线</h3>
              {loadingFollowUps ? (
                <p className="text-muted-foreground text-sm">加载中...</p>
              ) : followUps.length === 0 ? (
                <p className="text-muted-foreground text-sm">暂无跟进记录</p>
              ) : (
                <ol className="space-y-3">
                  {followUps.map((record) => (
                    <li key={record.id} className="border-l-2 border-slate-200 pl-3">
                      <div className="text-sm">{record.content}</div>
                      <div className="text-muted-foreground mt-0.5 text-xs">
                        {formatDateTime(record.createdAt)}
                        {record.nextFollowUpAt
                          ? ` · 下次 ${formatDateTime(record.nextFollowUpAt)}`
                          : ''}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </Drawer>

      <Drawer
        open={channelOpen}
        onClose={() => setChannelOpen(false)}
        title={channelEditing ? '编辑渠道' : '新建渠道'}
        description="渠道是活动投放的大类。"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setChannelOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitChannel}
              disabled={savingChannel}
            >
              {savingChannel ? '保存中...' : '保存'}
            </button>
          </>
        }
      >
        <Field label="参数 code" required hint="URL 中的 source 值，如 door_poster">
          <input
            className="form-input"
            value={channelForm.code}
            onChange={(event) => setChannelForm({ ...channelForm, code: event.target.value })}
          />
        </Field>
        <Field label="渠道名称" required>
          <input
            className="form-input"
            value={channelForm.name}
            onChange={(event) => setChannelForm({ ...channelForm, name: event.target.value })}
          />
        </Field>
      </Drawer>

      <Drawer
        open={campaignOpen}
        onClose={() => setCampaignOpen(false)}
        title={campaignEditing ? '编辑活动' : '新建活动'}
        description="先创建活动，再通过活动二维码带来留资线索。"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCampaignOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitCampaign}
              disabled={savingCampaign}
            >
              {savingCampaign ? '保存中...' : '保存'}
            </button>
          </>
        }
      >
        <Field label="所属渠道" required>
          <select
            className="form-input"
            value={campaignForm.channelId}
            onChange={(event) =>
              setCampaignForm({ ...campaignForm, channelId: event.target.value })
            }
          >
            <option value="">选择渠道</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
        </Field>
        <FieldRow>
          <Field label="活动 code" required>
            <input
              className="form-input"
              value={campaignForm.code}
              onChange={(event) => setCampaignForm({ ...campaignForm, code: event.target.value })}
            />
          </Field>
          <Field label="触点 medium">
            <input
              className="form-input"
              value={campaignForm.medium}
              onChange={(event) => setCampaignForm({ ...campaignForm, medium: event.target.value })}
            />
          </Field>
        </FieldRow>
        <Field label="活动名称" required>
          <input
            className="form-input"
            value={campaignForm.name}
            onChange={(event) => setCampaignForm({ ...campaignForm, name: event.target.value })}
          />
        </Field>
        <FieldRow>
          <Field label="落地课程">
            <select
              className="form-input"
              value={campaignForm.courseSlug}
              onChange={(event) =>
                setCampaignForm({ ...campaignForm, courseSlug: event.target.value })
              }
            >
              <option value="">首页</option>
              {courses.map((course) => (
                <option key={course.id} value={course.slug}>
                  {course.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="状态">
            <select
              className="form-input"
              value={campaignForm.status}
              onChange={(event) => setCampaignForm({ ...campaignForm, status: event.target.value })}
            >
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="archived">archived</option>
            </select>
          </Field>
        </FieldRow>
      </Drawer>

      <Drawer
        open={Boolean(qrCampaign)}
        onClose={() => setQrCampaign(null)}
        title="活动二维码"
        description={qrCampaign?.name}
      >
        {qrLoading ? (
          <p className="text-muted-foreground text-sm">生成中...</p>
        ) : qr ? (
          <div className="space-y-4">
            <div className="flex justify-center rounded-xl border bg-white p-4">
              <img src={qr.qrCodeDataUrl} alt="活动二维码" className="h-56 w-56" />
            </div>
            <Field label="落地链接">
              <textarea className="form-input h-16" readOnly value={qr.landingUrl} />
            </Field>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary flex-1" onClick={copyLanding}>
                复制链接
              </button>
              <a
                className="btn btn-primary flex-1"
                href={qr.qrCodeDataUrl}
                download={`${qrCampaign?.code ?? 'campaign'}-qrcode.png`}
              >
                下载二维码
              </a>
            </div>
          </div>
        ) : null}
      </Drawer>
    </PageFrame>
  );
}
