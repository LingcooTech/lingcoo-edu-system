import { useEffect, useMemo, useState } from 'react';
import { Trash2, Plus, QrCode } from 'lucide-react';

import { api, apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Campaign, CampaignFunnelRow, Channel, ChannelFunnelRow, Course } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';

const CHANNELS = () => '/v1/crm/channels';
const CAMPAIGNS = () => '/v1/crm/campaigns';

const pct = (rate: number) => `${(rate * 100).toFixed(1)}%`;

export function MarketingPage() {
  const toast = useToast();
  const { data: channels, setData: setChannels } = useApiResource<Channel>(CHANNELS(), 'channels');
  const { data: campaigns, setData: setCampaigns } = useApiResource<Campaign>(
    CAMPAIGNS(),
    'campaigns',
  );
  const { data: courses } = useApiResource<Course>('/v1/courses', 'courses');
  const [funnel, setFunnel] = useState<CampaignFunnelRow[]>([]);
  const [channelFunnel, setChannelFunnel] = useState<ChannelFunnelRow[]>([]);

  useEffect(() => {
    api<{ byCampaign: CampaignFunnelRow[]; byChannel: ChannelFunnelRow[] }>('/v1/reports/funnel')
      .then((payload) => {
        setFunnel(payload.byCampaign ?? []);
        setChannelFunnel(payload.byChannel ?? []);
      })
      .catch(() => {
        setFunnel([]);
        setChannelFunnel([]);
      });
  }, []);

  const channelMap = useMemo(() => new Map(channels.map((c) => [c.id, c.name])), [channels]);

  // --- Channel editor ---
  const [channelOpen, setChannelOpen] = useState(false);
  const [channelEditing, setChannelEditing] = useState<Channel | null>(null);
  const [channelForm, setChannelForm] = useState({ code: '', name: '' });
  const [savingChannel, setSavingChannel] = useState(false);
  const [channelDeleteTarget, setChannelDeleteTarget] = useState<Channel | null>(null);

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
          `${CHANNELS()}/${channelEditing.id}`,
          channelForm,
        );
        setChannels(channels.map((item) => (item.id === channel.id ? channel : item)));
      } else {
        const { channel } = await apiPost<{ channel: Channel }>(CHANNELS(), channelForm);
        setChannels([channel, ...channels]);
      }
      toast.success('渠道已保存');
      setChannelOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingChannel(false);
    }
  }

  async function deleteChannel() {
    if (!channelDeleteTarget) return;
    try {
      const { channel } = await apiDelete<{ channel: Channel }>(
        `${CHANNELS()}/${channelDeleteTarget.id}`,
      );
      setChannels(channels.filter((item) => item.id !== channel.id));
      setChannelDeleteTarget(null);
      toast.success('渠道已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  }

  // --- Campaign editor ---
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignEditing, setCampaignEditing] = useState<Campaign | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    channelId: '',
    code: '',
    name: '',
    courseSlug: '',
    medium: 'qr_code',
    status: 'active' as Campaign['status'],
  });
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [campaignDeleteTarget, setCampaignDeleteTarget] = useState<Campaign | null>(null);

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
            status: campaign.status as Campaign['status'],
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
      toast.error('请先选择渠道(没有渠道请先创建)');
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
          `${CAMPAIGNS()}/${campaignEditing.id}`,
          payload,
        );
        setCampaigns(campaigns.map((item) => (item.id === campaign.id ? campaign : item)));
      } else {
        const { campaign } = await apiPost<{ campaign: Campaign }>(CAMPAIGNS(), payload);
        setCampaigns([campaign, ...campaigns]);
      }
      toast.success('活动已保存');
      setCampaignOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingCampaign(false);
    }
  }

  async function deleteCampaign() {
    if (!campaignDeleteTarget) return;
    try {
      const { campaign } = await apiDelete<{ campaign: Campaign }>(
        `${CAMPAIGNS()}/${campaignDeleteTarget.id}`,
      );
      setCampaigns(campaigns.filter((item) => item.id !== campaign.id));
      setCampaignDeleteTarget(null);
      toast.success('活动已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  }

  // --- QR drawer ---
  const [qrCampaign, setQrCampaign] = useState<Campaign | null>(null);
  const [qr, setQr] = useState<{ landingUrl: string; qrCodeDataUrl: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  async function openQr(campaign: Campaign) {
    setQrCampaign(campaign);
    setQr(null);
    setQrLoading(true);
    try {
      const payload = await api<{ landingUrl: string; qrCodeDataUrl: string }>(
        `${CAMPAIGNS()}/${campaign.id}/qrcode`,
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

  return (
    <PageFrame
      section="marketing"
      actions={
        <button type="button" className="btn btn-primary" onClick={() => openCampaign()}>
          <Plus className="h-4 w-4" />
          新建活动
        </button>
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">渠道</h2>
        <button type="button" className="btn btn-secondary" onClick={() => openChannel()}>
          <Plus className="h-4 w-4" />
          新建渠道
        </button>
      </div>
      <DataTable
        columns={[
          { key: 'name', header: '渠道', cell: (row) => row.name },
          { key: 'code', header: '参数 code', cell: (row) => <code>{row.code}</code> },
          {
            key: 'actions',
            header: '操作',
            cell: (row) => (
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1"
                  onClick={() => openChannel(row)}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1 text-red-600"
                  onClick={() => setChannelDeleteTarget(row)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              </div>
            ),
          },
        ]}
        data={channels}
        emptyMessage="还没有渠道，先新建一个(如 door_poster 门店海报)"
      />

      <div className="mt-8 mb-3">
        <h2 className="text-sm font-semibold text-slate-700">活动 / 二维码</h2>
      </div>
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
          { key: 'course', header: '关联课程', cell: (row) => row.courseSlug ?? '—' },
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
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1 text-red-600"
                  onClick={() => setCampaignDeleteTarget(row)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              </div>
            ),
          },
        ]}
        data={campaigns}
        emptyMessage="还没有活动，点右上角「新建活动」生成第一张获客二维码"
      />

      <div className="mt-8 mb-3">
        <h2 className="text-sm font-semibold text-slate-700">渠道转化漏斗</h2>
      </div>
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
          { key: 'new', header: '新线索', cell: (row) => row.new },
          { key: 'trialBooked', header: '约试听', cell: (row) => row.trialBooked },
          { key: 'trialAttended', header: '到店', cell: (row) => row.trialAttended },
          { key: 'paid', header: '缴费', cell: (row) => row.paid },
          { key: 'rate', header: '转化率', cell: (row) => pct(row.conversionRate) },
        ]}
        data={channelFunnel}
        emptyMessage="暂无渠道归因数据"
      />

      <div className="mt-8 mb-3">
        <h2 className="text-sm font-semibold text-slate-700">活动转化漏斗</h2>
      </div>
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
          { key: 'paid', header: '缴费', cell: (row) => row.paid },
          { key: 'rate', header: '转化率', cell: (row) => pct(row.conversionRate) },
        ]}
        data={funnel}
        emptyMessage="暂无活动归因数据"
      />

      <Drawer
        open={channelOpen}
        onClose={() => setChannelOpen(false)}
        title={channelEditing ? '编辑渠道' : '新建渠道'}
        description="渠道是获客大类，如门店海报、传单、微信群。"
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
            onChange={(e) => setChannelForm({ ...channelForm, code: e.target.value })}
          />
        </Field>
        <Field label="渠道名称" required>
          <input
            className="form-input"
            value={channelForm.name}
            onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })}
          />
        </Field>
      </Drawer>

      <Drawer
        open={campaignOpen}
        onClose={() => setCampaignOpen(false)}
        title={campaignEditing ? '编辑活动' : '新建活动'}
        description="一次具体投放，生成专属二维码用于归因。"
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
            onChange={(e) => setCampaignForm({ ...campaignForm, channelId: e.target.value })}
          >
            <option value="">— 选择渠道 —</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
        </Field>
        <FieldRow>
          <Field label="活动 code" required hint="如 summer_bridge">
            <input
              className="form-input"
              value={campaignForm.code}
              onChange={(e) => setCampaignForm({ ...campaignForm, code: e.target.value })}
            />
          </Field>
          <Field label="触点 medium">
            <input
              className="form-input"
              value={campaignForm.medium}
              onChange={(e) => setCampaignForm({ ...campaignForm, medium: e.target.value })}
            />
          </Field>
        </FieldRow>
        <Field label="活动名称" required>
          <input
            className="form-input"
            value={campaignForm.name}
            onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
          />
        </Field>
        <FieldRow>
          <Field label="落地课程(可选)" hint="二维码直达该课程详情">
            <select
              className="form-input"
              value={campaignForm.courseSlug}
              onChange={(e) => setCampaignForm({ ...campaignForm, courseSlug: e.target.value })}
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
              onChange={(e) =>
                setCampaignForm({ ...campaignForm, status: e.target.value as Campaign['status'] })
              }
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
          <p className="text-muted-foreground text-sm">生成中…</p>
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
            <p className="form-hint">
              扫码进入家长端,报名时自动带上来源与活动归因,可在「线索」与本页漏斗中追踪转化。
            </p>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(channelDeleteTarget)}
        title="删除渠道"
        message={
          channelDeleteTarget
            ? `确认删除「${channelDeleteTarget.name}」？该渠道下的活动会一并删除。`
            : ''
        }
        confirmLabel="删除"
        danger
        onCancel={() => setChannelDeleteTarget(null)}
        onConfirm={deleteChannel}
      />

      <ConfirmDialog
        open={Boolean(campaignDeleteTarget)}
        title="删除活动"
        message={campaignDeleteTarget ? `确认删除「${campaignDeleteTarget.name}」？` : ''}
        confirmLabel="删除"
        danger
        onCancel={() => setCampaignDeleteTarget(null)}
        onConfirm={deleteCampaign}
      />
    </PageFrame>
  );
}
