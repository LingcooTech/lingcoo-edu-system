import { useEffect, useMemo, useState } from 'react';
import { Download, FileCheck2, RotateCcw } from 'lucide-react';

import { api, apiPost } from '@/api/client';
import type {
  CampaignFunnelRow,
  ChannelFunnelRow,
  LessonAccount,
  Order,
  SettlementBatch,
} from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { MetricCard } from '@/components/shared/MetricCard';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { formatDateTime, money } from '@/lib/utils';

const pct = (rate: number) => `${(rate * 100).toFixed(1)}%`;

const ORDER_TYPE_LABEL: Record<string, string> = {
  package_purchase: '线上课时包',
  manual_package_grant: '线下添加课时包',
  seat_reservation: '试听席位保留费',
};

const PAYMENT_RECEIVER_TYPE_LABEL: Record<string, string> = {
  platform: '平台收款',
  provider: '课程提供方收款',
  other: '其他收款方',
};

interface ReceiverSettlementRow {
  key: string;
  receiverName: string;
  receiverType: string;
  receiverInstitutionId?: string | null;
  orderCount: number;
  paidOrderCount: number;
  pendingOrderCount: number;
  settledOrderCount: number;
  unsettledPaidOrderCount: number;
  paidAmount: number;
  pendingAmount: number;
  unsettledPaidAmount: number;
  onlinePackagePaidAmount: number;
  manualGrantPaidAmount: number;
  seatReservationPaidAmount: number;
  latestCreatedAt: string;
}

function receiverName(order: Order) {
  return order.paymentReceiverName?.trim() || '未标记收款方';
}

function receiverType(order: Order) {
  return order.paymentReceiverType || 'platform';
}

function orderPaidAt(order: Order) {
  return order.paidAt ?? order.createdAt;
}

function dateInputToIso(value: string, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }
  return date.toISOString();
}

function csvEscape(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = `\uFEFF${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const toast = useToast();
  const [channelFunnel, setChannelFunnel] = useState<ChannelFunnelRow[]>([]);
  const [campaignFunnel, setCampaignFunnel] = useState<CampaignFunnelRow[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [lessonAccounts, setLessonAccounts] = useState<LessonAccount[]>([]);
  const [settlementBatches, setSettlementBatches] = useState<SettlementBatch[]>([]);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [creatingSettlementKey, setCreatingSettlementKey] = useState('');
  const [voidingSettlementId, setVoidingSettlementId] = useState('');

  useEffect(() => {
    Promise.all([
      api<{ byChannel: ChannelFunnelRow[]; byCampaign: CampaignFunnelRow[] }>('/v1/reports/funnel'),
      api<{ orders: Order[] }>('/v1/orders'),
      api<{ lessonAccounts: LessonAccount[] }>('/v1/lesson-accounts'),
      api<{ settlementBatches: SettlementBatch[] }>('/v1/settlement-batches'),
    ])
      .then(([funnelPayload, orderPayload, lessonPayload, settlementPayload]) => {
        setChannelFunnel(funnelPayload.byChannel ?? []);
        setCampaignFunnel(funnelPayload.byCampaign ?? []);
        setOrders(orderPayload.orders ?? []);
        setLessonAccounts(lessonPayload.lessonAccounts ?? []);
        setSettlementBatches(settlementPayload.settlementBatches ?? []);
      })
      .catch(() => {
        setChannelFunnel([]);
        setCampaignFunnel([]);
        setOrders([]);
        setLessonAccounts([]);
        setSettlementBatches([]);
      });
  }, []);

  const startsAtIso = useMemo(() => dateInputToIso(startsOn), [startsOn]);
  const endsAtIso = useMemo(() => dateInputToIso(endsOn, true), [endsOn]);
  const ordersInRange = useMemo(() => {
    const startsAt = startsAtIso ? new Date(startsAtIso).getTime() : null;
    const endsAt = endsAtIso ? new Date(endsAtIso).getTime() : null;
    return orders.filter((order) => {
      const paidAt = new Date(orderPaidAt(order)).getTime();
      if (startsAt !== null && paidAt < startsAt) return false;
      if (endsAt !== null && paidAt > endsAt) return false;
      return true;
    });
  }, [endsAtIso, orders, startsAtIso]);

  const settledOrderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const batch of settlementBatches) {
      if (batch.status !== 'settled') continue;
      for (const row of batch.orders) {
        ids.add(row.orderId);
      }
    }
    return ids;
  }, [settlementBatches]);

  const summary = useMemo(() => {
    const paidOrders = ordersInRange.filter((order) => order.status === 'paid');
    const pendingOrders = ordersInRange.filter((order) => order.status === 'pending');
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
  }, [channelFunnel, lessonAccounts, ordersInRange]);

  const receiverSettlement = useMemo(() => {
    const rows = new Map<string, ReceiverSettlementRow>();

    for (const order of ordersInRange) {
      const type = receiverType(order);
      const name = receiverName(order);
      const key = `${type}:${order.paymentReceiverInstitutionId ?? name}`;
      const current =
        rows.get(key) ??
        ({
          key,
          receiverName: name,
          receiverType: type,
          receiverInstitutionId: order.paymentReceiverInstitutionId ?? null,
          orderCount: 0,
          paidOrderCount: 0,
          pendingOrderCount: 0,
          settledOrderCount: 0,
          unsettledPaidOrderCount: 0,
          paidAmount: 0,
          pendingAmount: 0,
          unsettledPaidAmount: 0,
          onlinePackagePaidAmount: 0,
          manualGrantPaidAmount: 0,
          seatReservationPaidAmount: 0,
          latestCreatedAt: order.createdAt,
        } satisfies ReceiverSettlementRow);

      current.orderCount += 1;
      if (order.status === 'paid') {
        current.paidOrderCount += 1;
        current.paidAmount += order.paidAmount;
        if (settledOrderIds.has(order.id)) {
          current.settledOrderCount += 1;
        } else {
          current.unsettledPaidOrderCount += 1;
          current.unsettledPaidAmount += order.paidAmount;
        }
        if (order.orderType === 'package_purchase') {
          current.onlinePackagePaidAmount += order.paidAmount;
        } else if (order.orderType === 'manual_package_grant') {
          current.manualGrantPaidAmount += order.paidAmount;
        } else if (order.orderType === 'seat_reservation') {
          current.seatReservationPaidAmount += order.paidAmount;
        }
      }
      if (order.status === 'pending') {
        current.pendingOrderCount += 1;
        current.pendingAmount += order.amount;
      }
      if (new Date(order.createdAt).getTime() > new Date(current.latestCreatedAt).getTime()) {
        current.latestCreatedAt = order.createdAt;
      }

      rows.set(key, current);
    }

    return Array.from(rows.values()).sort((a, b) => b.paidAmount - a.paidAmount);
  }, [ordersInRange, settledOrderIds]);

  const settlementSummary = useMemo(() => {
    return {
      providerPaidAmount: receiverSettlement
        .filter((row) => row.receiverType === 'provider')
        .reduce((sum, row) => sum + row.paidAmount, 0),
      platformPaidAmount: receiverSettlement
        .filter((row) => row.receiverType === 'platform')
        .reduce((sum, row) => sum + row.paidAmount, 0),
      seatReservationPaidAmount: receiverSettlement.reduce(
        (sum, row) => sum + row.seatReservationPaidAmount,
        0,
      ),
      settlementReceiverCount: receiverSettlement.length,
    };
  }, [receiverSettlement]);

  const settlementOrderDetails = useMemo(
    () =>
      ordersInRange
        .filter((order) => ['paid', 'pending'].includes(order.status))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 50),
    [ordersInRange],
  );

  async function createSettlementBatch(row: ReceiverSettlementRow) {
    setCreatingSettlementKey(row.key);
    try {
      const { settlementBatch } = await apiPost<{ settlementBatch: SettlementBatch }>(
        '/v1/settlement-batches',
        {
          paymentReceiverType: row.receiverType,
          paymentReceiverInstitutionId: row.receiverInstitutionId ?? null,
          paymentReceiverName: row.receiverName,
          startsAt: startsAtIso,
          endsAt: endsAtIso,
        },
      );
      setSettlementBatches([settlementBatch, ...settlementBatches]);
      toast.success('结算批次已生成');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成结算批次失败');
    } finally {
      setCreatingSettlementKey('');
    }
  }

  async function voidSettlementBatch(batch: SettlementBatch) {
    setVoidingSettlementId(batch.id);
    try {
      const { settlementBatch } = await apiPost<{ settlementBatch: SettlementBatch }>(
        `/v1/settlement-batches/${batch.id}/void`,
        {},
      );
      setSettlementBatches((current) =>
        current.map((item) =>
          item.id === settlementBatch.id ? { ...item, ...settlementBatch } : item,
        ),
      );
      toast.success('结算批次已作废');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '作废结算批次失败');
    } finally {
      setVoidingSettlementId('');
    }
  }

  function exportReceiverSettlement() {
    downloadCsv('收款方结算汇总.csv', [
      [
        '收款方',
        '收款方类型',
        '订单数',
        '已支付订单',
        '已结算订单',
        '未结算订单',
        '已收金额',
        '未结算金额',
        '待收金额',
        '席位保留费',
        '线下课时包',
        '线上课时包',
      ],
      ...receiverSettlement.map((row) => [
        row.receiverName,
        PAYMENT_RECEIVER_TYPE_LABEL[row.receiverType] ?? row.receiverType,
        row.orderCount,
        row.paidOrderCount,
        row.settledOrderCount,
        row.unsettledPaidOrderCount,
        money(row.paidAmount),
        money(row.unsettledPaidAmount),
        money(row.pendingAmount),
        money(row.seatReservationPaidAmount),
        money(row.manualGrantPaidAmount),
        money(row.onlinePackagePaidAmount),
      ]),
    ]);
  }

  function exportSettlementOrderDetails() {
    downloadCsv('收款方订单明细.csv', [
      [
        '订单号',
        '订单类型',
        '收款方',
        '收款方类型',
        '课程',
        '学员',
        '金额',
        '订单状态',
        '结算状态',
        '支付时间',
      ],
      ...settlementOrderDetails.map((order) => [
        order.orderNo,
        ORDER_TYPE_LABEL[order.orderType ?? ''] ?? order.orderType ?? '-',
        receiverName(order),
        PAYMENT_RECEIVER_TYPE_LABEL[receiverType(order)] ?? receiverType(order),
        order.course?.name ?? '-',
        order.student?.name ?? '-',
        money(order.status === 'paid' ? order.paidAmount : order.amount),
        order.status,
        order.status === 'paid' ? (settledOrderIds.has(order.id) ? '已结算' : '未结算') : '待支付',
        formatDateTime(orderPaidAt(order)),
      ]),
    ]);
  }

  return (
    <PageFrame
      section="reports"
      actions={
        <div className="flex flex-wrap justify-end gap-2">
          <input
            className="form-input w-auto py-1.5"
            type="date"
            value={startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
          />
          <input
            className="form-input w-auto py-1.5"
            type="date"
            value={endsOn}
            onChange={(event) => setEndsOn(event.target.value)}
          />
          <button type="button" className="btn btn-secondary" onClick={exportReceiverSettlement}>
            <Download className="h-4 w-4" />
            导出汇总
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={exportSettlementOrderDetails}
          >
            <Download className="h-4 w-4" />
            导出明细
          </button>
        </div>
      }
    >
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
        <MetricCard label="低余额账户" value={summary.lowBalanceAccounts} hint="课时余额 <= 3" />
        <MetricCard
          label="线索成交率"
          value={pct(summary.conversionRate)}
          hint={`${summary.paidLeads}/${summary.totalLeads} 已成交`}
        />
      </div>

      <div className="metric-grid mt-8">
        <MetricCard
          label="课程提供方已收"
          value={money(settlementSummary.providerPaidAmount)}
          hint="收款方类型为课程提供方"
        />
        <MetricCard
          label="平台已收"
          value={money(settlementSummary.platformPaidAmount)}
          hint="收款方类型为平台"
        />
        <MetricCard
          label="试听席位保留费"
          value={money(settlementSummary.seatReservationPaidAmount)}
          hint="已支付占位费订单"
        />
        <MetricCard
          label="结算对象"
          value={settlementSummary.settlementReceiverCount}
          hint="按收款方名称/类型聚合"
        />
      </div>

      <div className="mt-8 mb-3">
        <h2 className="text-sm font-semibold text-slate-700">收款方结算汇总</h2>
      </div>
      <DataTable
        columns={[
          {
            key: 'receiver',
            header: '收款方',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.receiverName}</span>
                <span className="cell-subtitle">
                  {PAYMENT_RECEIVER_TYPE_LABEL[row.receiverType] ?? row.receiverType}
                </span>
              </div>
            ),
          },
          {
            key: 'orders',
            header: '订单',
            cell: (row) => `${row.paidOrderCount}/${row.orderCount} 已支付`,
          },
          { key: 'paid', header: '已收', cell: (row) => money(row.paidAmount) },
          {
            key: 'unsettled',
            header: '未结算',
            cell: (row) => `${row.unsettledPaidOrderCount} 笔 · ${money(row.unsettledPaidAmount)}`,
          },
          { key: 'pending', header: '待收', cell: (row) => money(row.pendingAmount) },
          {
            key: 'seat',
            header: '席位保留费',
            cell: (row) => money(row.seatReservationPaidAmount),
          },
          {
            key: 'manual',
            header: '线下课时包',
            cell: (row) => money(row.manualGrantPaidAmount),
          },
          {
            key: 'online',
            header: '线上课时包',
            cell: (row) => money(row.onlinePackagePaidAmount),
          },
          {
            key: 'latest',
            header: '最近订单',
            cell: (row) => formatDateTime(row.latestCreatedAt),
          },
          {
            key: 'actions',
            header: '操作',
            cell: (row) =>
              row.unsettledPaidOrderCount > 0 ? (
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1"
                  disabled={creatingSettlementKey === row.key}
                  onClick={() => createSettlementBatch(row)}
                >
                  <FileCheck2 className="h-3.5 w-3.5" />
                  {creatingSettlementKey === row.key ? '生成中...' : '生成批次'}
                </button>
              ) : (
                <span className="text-muted-foreground text-xs">已结清</span>
              ),
          },
        ]}
        data={receiverSettlement}
        emptyMessage="暂无可结算订单"
      />

      <div className="mt-8 mb-3">
        <h2 className="text-sm font-semibold text-slate-700">结算批次</h2>
      </div>
      <DataTable
        columns={[
          {
            key: 'batch',
            header: '批次',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.paymentReceiverName}</span>
                <span className="cell-subtitle">{formatDateTime(row.settledAt)}</span>
              </div>
            ),
          },
          {
            key: 'receiverType',
            header: '收款方类型',
            cell: (row) =>
              PAYMENT_RECEIVER_TYPE_LABEL[row.paymentReceiverType] ?? row.paymentReceiverType,
          },
          { key: 'orders', header: '订单', cell: (row) => `${row.orderCount} 笔` },
          { key: 'amount', header: '结算金额', cell: (row) => money(row.totalAmount) },
          {
            key: 'range',
            header: '范围',
            cell: (row) =>
              row.startsAt || row.endsAt
                ? `${row.startsAt ? formatDateTime(row.startsAt) : '-'} 至 ${
                    row.endsAt ? formatDateTime(row.endsAt) : '-'
                  }`
                : '全部日期',
          },
          {
            key: 'status',
            header: '状态',
            cell: (row) => <StatusPill tone={statusToTone(row.status)} label={row.status} />,
          },
          {
            key: 'actions',
            header: '操作',
            cell: (row) =>
              row.status === 'settled' ? (
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1 text-red-600"
                  disabled={voidingSettlementId === row.id}
                  onClick={() => voidSettlementBatch(row)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {voidingSettlementId === row.id ? '作废中...' : '作废'}
                </button>
              ) : (
                <span className="text-muted-foreground text-xs">不可操作</span>
              ),
          },
        ]}
        data={settlementBatches}
        emptyMessage="暂无结算批次"
      />

      <div className="mt-8 mb-3">
        <h2 className="text-sm font-semibold text-slate-700">收款方订单明细</h2>
      </div>
      <DataTable
        columns={[
          {
            key: 'order',
            header: '订单',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.orderNo}</span>
                <span className="cell-subtitle">
                  {ORDER_TYPE_LABEL[row.orderType ?? ''] ?? row.orderType ?? '-'}
                </span>
              </div>
            ),
          },
          {
            key: 'receiver',
            header: '收款方',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{receiverName(row)}</span>
                <span className="cell-subtitle">
                  {PAYMENT_RECEIVER_TYPE_LABEL[receiverType(row)] ?? receiverType(row)}
                </span>
              </div>
            ),
          },
          { key: 'course', header: '课程', cell: (row) => row.course?.name ?? '-' },
          { key: 'student', header: '学员', cell: (row) => row.student?.name ?? '-' },
          {
            key: 'amount',
            header: '金额',
            cell: (row) => money(row.status === 'paid' ? row.paidAmount : row.amount),
          },
          {
            key: 'status',
            header: '状态',
            cell: (row) => <StatusPill tone={statusToTone(row.status)} label={row.status} />,
          },
          {
            key: 'settlement',
            header: '结算',
            cell: (row) => {
              const status =
                row.status === 'paid'
                  ? settledOrderIds.has(row.id)
                    ? 'settled'
                    : 'unsettled'
                  : 'pending';
              return <StatusPill tone={statusToTone(status)} label={status} />;
            },
          },
          { key: 'paidAt', header: '支付时间', cell: (row) => formatDateTime(orderPaidAt(row)) },
        ]}
        data={settlementOrderDetails}
        emptyMessage="暂无订单明细"
      />

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
