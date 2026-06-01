import { useEffect, useMemo, useState } from 'react';
import { Plus, QrCode, Trash2 } from 'lucide-react';

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
  const [tab, setTab] = useState<'channels' | 'campaigns' | 'funnel'>('channels');
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
  }, []);

  const channelMap = useMemo(
    () => new Map(channels.map((item) => [item.id, item.name])),
    [channels],
  );

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
      setChannelOpen(false);
      toast.success('渠道已保存');
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
      setCampaigns(campaigns.filter((item) => item.channelId !== channel.id));
      setChannelDeleteTarget(null);
      toast.success('渠道已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
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
    if (!campaignForm.channelId || !campaignForm.code.trim() || !campaignForm.name.trim()) {
      toast.error('请选择渠道，并填写活动 code 和名称');
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
      setCampaignOpen(false);
      toast.success('活动已保存');
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

  const [qrCampaign, setQrCampaign] = useState<Campaign | null>(null);
  const [qr, setQr] = useState<{ landingUrl: string; qrCodeDataUrl: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  async function openQr(campaign: Campaign) {
    setQrCampaign(campaign);
    setQr(null);
    setQrLoading(true);
    try {
      setQr(
        await api<{ landingUrl: string; qrCodeDataUrl: string }>(
          `${CAMPAIGNS()}/${campaign.id}/qrcode`,
        ),
      );
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
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ['channels', '渠道'],
          ['campaigns', '活动'],
          ['funnel', '转化漏斗'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setTab(key as typeof tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'channels' && (
        <>
          <div className="mb-3 flex justify-end">
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
            emptyMessage="还没有渠道，先新建成熟渠道或投放渠道。"
          />
        </>
      )}

      {tab === 'campaigns' && (
        <DataTable
          columns={[
            {
              key: 'name',
              header: '活动',
              cell: (row) => (
                <div className="cell-stack">
                  <span className="cell-title">{row.name}</span>
                  <span className="cell-subtitle">
                    {channelMap.get(row.channelId) ?? '-'} · <code>{row.code}</code>
                  </span>
                </div>
              ),
            },
            { key: 'course', header: '落地课程', cell: (row) => row.courseSlug ?? '首页' },
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
          emptyMessage="还没有活动，先创建活动并生成专属二维码。"
        />
      )}

      {tab === 'funnel' && (
        <div className="space-y-6">
          <DataTable
            columns={[
              { key: 'name', header: '渠道', cell: (row) => row.name },
              { key: 'total', header: '线索', cell: (row) => row.total },
              { key: 'trialBooked', header: '约试听', cell: (row) => row.trialBooked },
              { key: 'trialAttended', header: '到店', cell: (row) => row.trialAttended },
              { key: 'paid', header: '缴费', cell: (row) => row.paid },
              { key: 'rate', header: '转化率', cell: (row) => pct(row.conversionRate) },
            ]}
            data={channelFunnel}
            emptyMessage="暂无渠道归因数据"
          />
          <DataTable
            columns={[
              { key: 'name', header: '活动', cell: (row) => row.name },
              { key: 'total', header: '线索', cell: (row) => row.total },
              { key: 'trialBooked', header: '约试听', cell: (row) => row.trialBooked },
              { key: 'trialAttended', header: '到店', cell: (row) => row.trialAttended },
              { key: 'paid', header: '缴费', cell: (row) => row.paid },
              { key: 'rate', header: '转化率', cell: (row) => pct(row.conversionRate) },
            ]}
            data={campaignFunnel}
            emptyMessage="暂无活动归因数据"
          />
        </div>
      )}

      <Drawer
        open={channelOpen}
        onClose={() => setChannelOpen(false)}
        title={channelEditing ? '编辑渠道' : '新建渠道'}
        description="渠道是线索来源大类，如合作机构、门店海报、微信群。"
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
        <Field label="参数 code" required hint="URL 中的 source 值，如 partner_org">
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
        description="活动绑定渠道后，可生成专属唯一二维码用于留资归因。"
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
        title="活动专属二维码"
        description={qrCampaign?.name}
      >
        {qrLoading ? (
          <p className="text-muted-foreground text-sm">生成中...</p>
        ) : qr ? (
          <div className="space-y-4">
            <div className="flex justify-center rounded-xl border bg-white p-4">
              <img src={qr.qrCodeDataUrl} alt="活动二维码" className="h-56 w-56" />
            </div>
            <Field label="唯一落地链接">
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
