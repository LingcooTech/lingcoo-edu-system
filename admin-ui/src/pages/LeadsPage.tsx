import { useEffect, useMemo, useState } from 'react';
import { ArrowRightCircle, ListFilter, Trash2 } from 'lucide-react';

import { api, apiDelete, apiPost } from '@/api/client';
import type { Campaign, Channel, FollowUp, Lead, LeadStatus } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field } from '@/components/shared/FormField';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';
import { formatDateTime } from '@/lib/utils';

const LEADS_BASE = () => '/v1/crm/leads';

const statusOptions: LeadStatus[] = [
  'new',
  'contacted',
  'trial_booked',
  'trial_attended',
  'follow_up',
  'paid',
  'course_delivery',
  'invalid',
];

const statusLabels: Record<LeadStatus, string> = {
  new: '待联系',
  contacted: '初步沟通',
  trial_booked: '预约试听',
  trial_attended: '试听结束',
  follow_up: '订单跟进',
  paid: '报名缴费',
  course_delivery: '课程交付',
  invalid: '无效',
};

export function LeadsPage() {
  const toast = useToast();
  const { data, setData } = useApiResource<Lead>(LEADS_BASE(), 'leads');
  const { data: channels } = useApiResource<Channel>('/v1/crm/channels', 'channels');
  const { data: campaigns } = useApiResource<Campaign>('/v1/crm/campaigns', 'campaigns');

  const channelName = useMemo(() => {
    const map = new Map(channels.map((c) => [c.id, c.name]));
    return (id?: string | null) => (id ? (map.get(id) ?? '—') : '—');
  }, [channels]);
  const campaignName = useMemo(() => {
    const map = new Map(campaigns.map((c) => [c.id, c.name]));
    return (id?: string | null) => (id ? (map.get(id) ?? '—') : '—');
  }, [campaigns]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [query, setQuery] = useState('');
  const sources = useMemo(
    () => Array.from(new Set(data.map((lead) => lead.source).filter(Boolean))).sort(),
    [data],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.filter((lead) => {
      if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && lead.source !== sourceFilter) return false;
      if (channelFilter !== 'all' && lead.channelId !== channelFilter) return false;
      if (campaignFilter !== 'all' && lead.campaignId !== campaignFilter) return false;
      if (!q) return true;
      return (
        lead.studentName.toLowerCase().includes(q) ||
        lead.guardianName.toLowerCase().includes(q) ||
        lead.phone.includes(q) ||
        lead.source.toLowerCase().includes(q)
      );
    });
  }, [data, statusFilter, sourceFilter, channelFilter, campaignFilter, query]);

  // Detail drawer
  const [selected, setSelected] = useState<Lead | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loadingFollowUps, setLoadingFollowUps] = useState(false);
  const [followUpText, setFollowUpText] = useState('');
  const [nextAt, setNextAt] = useState('');
  const [submittingFollowUp, setSubmittingFollowUp] = useState(false);
  const [convertSchool, setConvertSchool] = useState('');
  const [converting, setConverting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setLoadingFollowUps(true);
    setFollowUps([]);
    api<{ followUps: FollowUp[] }>(`${LEADS_BASE()}/${selected.id}/follow-ups`)
      .then((payload) => setFollowUps(payload.followUps))
      .catch(() => setFollowUps([]))
      .finally(() => setLoadingFollowUps(false));
  }, [selected]);

  function patchLeadInState(updated: Lead) {
    setData(data.map((item) => (item.id === updated.id ? updated : item)));
    setSelected((current) => (current && current.id === updated.id ? updated : current));
  }

  async function updateStatus(lead: Lead, status: LeadStatus) {
    try {
      const { lead: updated } = await api<{ lead: Lead }>(`${LEADS_BASE()}/${lead.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      patchLeadInState(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    }
  }

  async function submitFollowUp() {
    if (!selected || !followUpText.trim()) {
      toast.error('请填写跟进内容');
      return;
    }
    setSubmittingFollowUp(true);
    try {
      const body: { content: string; nextFollowUpAt?: string } = { content: followUpText.trim() };
      if (nextAt) body.nextFollowUpAt = new Date(nextAt).toISOString();
      const { followUp, lead } = await apiPost<{ followUp: FollowUp; lead: Lead }>(
        `${LEADS_BASE()}/${selected.id}/follow-ups`,
        body,
      );
      setFollowUps([followUp, ...followUps]);
      patchLeadInState(lead);
      setFollowUpText('');
      setNextAt('');
      toast.success('跟进已记录');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmittingFollowUp(false);
    }
  }

  async function convertLead() {
    if (!selected) return;
    setConverting(true);
    try {
      const { lead } = await apiPost<{ lead: Lead }>(`${LEADS_BASE()}/${selected.id}/convert`, {
        school: convertSchool || undefined,
      });
      patchLeadInState(lead);
      setConvertSchool('');
      toast.success('已转为正式学员');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '转化失败');
    } finally {
      setConverting(false);
    }
  }

  async function deleteLead() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { lead } = await apiDelete<{ lead: Lead }>(`${LEADS_BASE()}/${deleteTarget.id}`);
      setData(data.filter((item) => item.id !== lead.id));
      setSelected((current) => (current?.id === lead.id ? null : current));
      setDeleteTarget(null);
      toast.success('线索已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PageFrame
      section="leads"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <ListFilter className="text-muted-foreground h-4 w-4" />
          <select
            className="form-input w-auto py-1.5"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | LeadStatus)}
          >
            <option value="all">全部状态</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
          <select
            className="form-input w-auto py-1.5"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="all">全部来源</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
          <select
            className="form-input w-auto py-1.5"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
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
            onChange={(e) => setCampaignFilter(e.target.value)}
          >
            <option value="all">全部活动</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
          <input
            className="form-input w-44 py-1.5"
            placeholder="搜索姓名/手机/来源"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      }
    >
      <DataTable
        columns={[
          {
            key: 'student',
            header: '学员 / 家长',
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
            header: '来源 / 渠道',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.source}</span>
                <span className="cell-subtitle">
                  {channelName(row.channelId)}
                  {row.campaignId ? ` · ${campaignName(row.campaignId)}` : ''}
                </span>
              </div>
            ),
          },
          {
            key: 'status',
            header: '状态',
            cell: (row) => (
              <StatusPill tone={statusToTone(row.status)} label={statusLabels[row.status]} />
            ),
          },
          {
            key: 'action',
            header: '操作',
            cell: (row) => (
              <div className="flex flex-wrap gap-1">
                <select
                  className="form-input w-auto py-1"
                  value={row.status}
                  onChange={(event) => updateStatus(row, event.target.value as LeadStatus)}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1 text-red-600"
                  onClick={() => setDeleteTarget(row)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              </div>
            ),
          },
        ]}
        data={filtered}
      />

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.studentName}` : ''}
        description={selected ? `${selected.guardianName} · ${selected.phone}` : ''}
      >
        {selected && (
          <div className="space-y-5">
            <section className="resource-card p-4">
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-muted-foreground">年级</span>
                <span>{selected.grade}</span>
                <span className="text-muted-foreground">来源</span>
                <span>{selected.source}</span>
                <span className="text-muted-foreground">渠道</span>
                <span>{channelName(selected.channelId)}</span>
                <span className="text-muted-foreground">活动</span>
                <span>{campaignName(selected.campaignId)}</span>
                <span className="text-muted-foreground">触点</span>
                <span>{selected.medium ?? '—'}</span>
                <span className="text-muted-foreground">状态</span>
                <span>
                  <StatusPill
                    tone={statusToTone(selected.status)}
                    label={statusLabels[selected.status]}
                  />
                </span>
              </div>
            </section>

            {selected.convertedStudentId ? (
              <section className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                已转为正式学员。
              </section>
            ) : (
              <section className="resource-card p-4">
                <h3 className="mb-2 text-sm font-semibold">转为正式学员</h3>
                <Field label="学校(可选)">
                  <input
                    className="form-input"
                    value={convertSchool}
                    onChange={(e) => setConvertSchool(e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="btn btn-primary w-full"
                  onClick={convertLead}
                  disabled={converting}
                >
                  <ArrowRightCircle className="h-4 w-4" />
                  {converting ? '转化中...' : '转为正式学员'}
                </button>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-semibold">添加跟进</h3>
              <textarea
                className="form-input h-20"
                placeholder="记录本次沟通内容…"
                value={followUpText}
                onChange={(e) => setFollowUpText(e.target.value)}
              />
              <div className="mt-2 flex items-end gap-2">
                <Field label="下次跟进时间(可选)">
                  <input
                    className="form-input"
                    type="datetime-local"
                    value={nextAt}
                    onChange={(e) => setNextAt(e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="btn btn-primary mb-3.5 shrink-0"
                  onClick={submitFollowUp}
                  disabled={submittingFollowUp}
                >
                  {submittingFollowUp ? '提交中...' : '记录'}
                </button>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">跟进时间线</h3>
              {loadingFollowUps ? (
                <p className="text-muted-foreground text-sm">加载中…</p>
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
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除线索？"
        message={`确认删除「${deleteTarget?.studentName ?? ''} / ${deleteTarget?.guardianName ?? ''}」？跟进记录会一并删除。`}
        confirmLabel="删除"
        danger
        busy={deleting}
        onConfirm={deleteLead}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageFrame>
  );
}
