import { useEffect, useMemo, useState } from 'react';

import { api } from '@/api/client';
import type { CampaignFunnelRow, ChannelFunnelRow, LessonAccount, Order } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { MetricCard } from '@/components/shared/MetricCard';
import { money } from '@/lib/utils';

const pct = (rate: number) => `${(rate * 100).toFixed(1)}%`;

export function ReportsPage() {
  const [channelFunnel, setChannelFunnel] = useState<ChannelFunnelRow[]>([]);
  const [campaignFunnel, setCampaignFunnel] = useState<CampaignFunnelRow[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [lessonAccounts, setLessonAccounts] = useState<LessonAccount[]>([]);

  useEffect(() => {
    Promise.all([
      api<{ byChannel: ChannelFunnelRow[]; byCampaign: CampaignFunnelRow[] }>(
        '/v1/reports/funnel',
      ),
      api<{ orders: Order[] }>('/v1/orders'),
      api<{ lessonAccounts: LessonAccount[] }>('/v1/lesson-accounts'),
    ])
      .then(([funnelPayload, orderPayload, lessonPayload]) => {
        setChannelFunnel(funnelPayload.byChannel ?? []);
        setCampaignFunnel(funnelPayload.byCampaign ?? []);
        setOrders(orderPayload.orders ?? []);
        setLessonAccounts(lessonPayload.lessonAccounts ?? []);
      })
      .catch(() => {
        setChannelFunnel([]);
        setCampaignFunnel([]);
        setOrders([]);
        setLessonAccounts([]);
      });
  }, []);

  const summary = useMemo(() => {
    const paidOrders = orders.filter((order) => order.status === 'paid');
    const pendingOrders = orders.filter((order) => order.status === 'pending');
    const revenue = paidOrders.reduce((sum, order) => sum + order.paidAmount, 0);
    const pendingAmount = pendingOrders.reduce((sum, order) => sum + order.amount, 0);
    const lowBalanceAccounts = lessonAccounts.filter((account) => account.balance <= 3);
    const totalLeads = channelFunnel.reduce((sum, row) => sum + row.total, 0);
    const paidLeads = channelFunnel.reduce((sum, row) => sum + row.paid, 0);
    return {
      revenue,
      paidOrders: paidOrders.length,
      pendingAmount,
      pendingOrders: pendingOrders.length,
      lowBalanceAccounts: lowBalanceAccounts.length,
      totalLeads,
      paidLeads,
      conversionRate: totalLeads > 0 ? paidLeads / totalLeads : 0,
    };
  }, [channelFunnel, lessonAccounts, orders]);

  return (
    <PageFrame section="reports">
      <div className="metric-grid">
        <MetricCard
          label="已收收入"
          value={money(summary.revenue)}
          hint={`${summary.paidOrders} 笔已支付订单`}
        />
        <MetricCard
          label="待收款"
          value={money(summary.pendingAmount)}
          hint={`${summary.pendingOrders} 笔待支付订单`}
        />
        <MetricCard
          label="低余额账户"
          value={summary.lowBalanceAccounts}
          hint="课时余额 <= 3"
        />
        <MetricCard
          label="线索成交率"
          value={pct(summary.conversionRate)}
          hint={`${summary.paidLeads}/${summary.totalLeads} 已成交`}
        />
      </div>

      <div className="mt-8 mb-3">
        <h2 className="text-sm font-semibold text-slate-700">渠道转化</h2>
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
          { key: 'contacted', header: '已联系', cell: (row) => row.contacted },
          { key: 'trialBooked', header: '约试听', cell: (row) => row.trialBooked },
          { key: 'trialAttended', header: '已试听', cell: (row) => row.trialAttended },
          { key: 'paid', header: '缴费', cell: (row) => row.paid },
          { key: 'rate', header: '成交率', cell: (row) => pct(row.conversionRate) },
        ]}
        data={channelFunnel}
        emptyMessage="暂无渠道归因数据"
      />

      <div className="mt-8 mb-3">
        <h2 className="text-sm font-semibold text-slate-700">活动转化</h2>
      </div>
      <DataTable
        columns={[
          {
            key: 'name',
            header: '活动',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.name}</span>
                <span className="cell-subtitle">{row.channelName ?? '-'}</span>
              </div>
            ),
          },
          { key: 'total', header: '线索', cell: (row) => row.total },
          { key: 'trialBooked', header: '约试听', cell: (row) => row.trialBooked },
          { key: 'trialAttended', header: '已试听', cell: (row) => row.trialAttended },
          { key: 'paid', header: '缴费', cell: (row) => row.paid },
          { key: 'rate', header: '成交率', cell: (row) => pct(row.conversionRate) },
        ]}
        data={campaignFunnel}
        emptyMessage="暂无活动归因数据"
      />

      <div className="mt-8 mb-3">
        <h2 className="text-sm font-semibold text-slate-700">低余额课时账户</h2>
      </div>
      <DataTable
        columns={[
          {
            key: 'student',
            header: '学员',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.student?.name ?? '-'}</span>
                <span className="cell-subtitle">{row.student?.grade ?? '-'}</span>
              </div>
            ),
          },
          { key: 'course', header: '课程', cell: (row) => row.course?.name ?? '-' },
          { key: 'balance', header: '剩余课时', cell: (row) => `${row.balance} 节` },
        ]}
        data={lessonAccounts.filter((account) => account.balance <= 3)}
        emptyMessage="暂无低余额课时账户"
      />
    </PageFrame>
  );
}
