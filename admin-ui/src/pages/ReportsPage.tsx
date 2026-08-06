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
import { exportStyledExcel } from '@/lib/excel-export';
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

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: '现金',
  bank_transfer: '银行转账',
  wechat_offline: '微信线下',
  alipay_offline: '支付宝线下',
  offline_other: '其他线下',
  wechat_pay: '微信支付',
  alipay: '支付宝',
  mock: '模拟支付',
  online_payment: '线上支付',
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: '待支付',
  paid: '已支付',
  refunded: '已退款',
  cancelled: '已取消',
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
  courseNames: string[];
  packageNames: string[];
  studentNames: string[];
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

function approvedRefundAmount(order: Order) {
  return (order.refundRequests ?? [])
    .filter((refund) => refund.status === 'approved')
    .reduce((sum, refund) => sum + refund.amount, 0);
}

function packageBillingLabel(order: Order) {
  if (!order.package) return order.orderType === 'seat_reservation' ? '试听席位' : '自定义课时';
  if (order.package.billingType !== 'period') return '课时卡';
  const unit = order.package.periodUnit === 'week' ? '周' : '个月';
  return `周期卡（${order.package.periodCount ?? 1}${unit}）`;
}

function addUnique(values: string[], value?: string | null) {
  const normalized = value?.trim();
  if (normalized && !values.includes(normalized)) values.push(normalized);
}

function settlementStatusLabel(order: Order, settledOrderIds: Set<string>) {
  if (order.status === 'paid') return settledOrderIds.has(order.id) ? '已结算' : '未结算';
  return ORDER_STATUS_LABEL[order.status] ?? order.status;
}

function dateInputToIso(value: string, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }
  return date.toISOString();
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
  const [exporting, setExporting] = useState<'summary' | 'details' | null>(null);

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
          courseNames: [],
          packageNames: [],
          studentNames: [],
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
      addUnique(current.courseNames, order.course?.name);
      addUnique(
        current.packageNames,
        order.package?.name ??
          (order.orderType === 'seat_reservation' ? '试听席位保留费' : '自定义课时'),
      );
      addUnique(current.studentNames, order.student?.name);

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
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
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

  async function exportReceiverSettlement() {
    if (receiverSettlement.length === 0) {
      toast.error('当前日期范围内没有可导出的结算汇总');
      return;
    }
    setExporting('summary');
    try {
      const dateKey = new Intl.DateTimeFormat('sv-SE').format(new Date());
      await exportStyledExcel({
        filename: `收款方结算汇总-${dateKey}`,
        sheetName: '结算汇总',
        title: '收款方结算汇总',
        subtitle: `统计范围：${startsOn || '不限开始日期'} 至 ${endsOn || '不限结束日期'}`,
        rows: receiverSettlement,
        columns: [
          { key: 'receiverName', header: '收款方', value: (row) => row.receiverName, width: 22 },
          {
            key: 'receiverType',
            header: '收款方类型',
            value: (row) => PAYMENT_RECEIVER_TYPE_LABEL[row.receiverType] ?? row.receiverType,
            width: 17,
          },
          {
            key: 'courseNames',
            header: '涉及课程',
            value: (row) => row.courseNames.join('\n') || '-',
            width: 24,
          },
          {
            key: 'packageNames',
            header: '涉及课包',
            value: (row) => row.packageNames.join('\n') || '-',
            width: 28,
          },
          {
            key: 'studentCount',
            header: '学员数',
            value: (row) => row.studentNames.length,
            width: 11,
            format: 'integer',
          },
          {
            key: 'orderCount',
            header: '订单数',
            value: (row) => row.orderCount,
            width: 11,
            format: 'integer',
          },
          {
            key: 'paidOrderCount',
            header: '已支付订单',
            value: (row) => row.paidOrderCount,
            width: 13,
            format: 'integer',
          },
          {
            key: 'settledOrderCount',
            header: '已结算订单',
            value: (row) => row.settledOrderCount,
            width: 13,
            format: 'integer',
          },
          {
            key: 'unsettledPaidOrderCount',
            header: '未结算订单',
            value: (row) => row.unsettledPaidOrderCount,
            width: 13,
            format: 'integer',
          },
          {
            key: 'paidAmount',
            header: '已收金额',
            value: (row) => row.paidAmount / 100,
            width: 14,
            format: 'currency',
          },
          {
            key: 'unsettledPaidAmount',
            header: '未结算金额',
            value: (row) => row.unsettledPaidAmount / 100,
            width: 15,
            format: 'currency',
          },
          {
            key: 'pendingAmount',
            header: '待收金额',
            value: (row) => row.pendingAmount / 100,
            width: 14,
            format: 'currency',
          },
          {
            key: 'seatReservationPaidAmount',
            header: '席位保留费',
            value: (row) => row.seatReservationPaidAmount / 100,
            width: 15,
            format: 'currency',
          },
          {
            key: 'manualGrantPaidAmount',
            header: '线下课时包',
            value: (row) => row.manualGrantPaidAmount / 100,
            width: 15,
            format: 'currency',
          },
          {
            key: 'onlinePackagePaidAmount',
            header: '线上课时包',
            value: (row) => row.onlinePackagePaidAmount / 100,
            width: 15,
            format: 'currency',
          },
        ],
      });
      toast.success(`已导出 ${receiverSettlement.length} 条结算汇总`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(null);
    }
  }

  async function exportSettlementOrderDetails() {
    if (settlementOrderDetails.length === 0) {
      toast.error('当前日期范围内没有可导出的订单明细');
      return;
    }
    setExporting('details');
    try {
      const dateKey = new Intl.DateTimeFormat('sv-SE').format(new Date());
      await exportStyledExcel({
        filename: `收款方订单明细-${dateKey}`,
        sheetName: '订单明细',
        title: '收款方订单明细',
        subtitle: `统计范围：${startsOn || '不限开始日期'} 至 ${endsOn || '不限结束日期'}`,
        rows: settlementOrderDetails,
        columns: [
          {
            key: 'orderNo',
            header: '订单号',
            value: (order) => order.orderNo,
            width: 23,
            format: 'text',
          },
          {
            key: 'orderType',
            header: '订单类型',
            value: (order) => ORDER_TYPE_LABEL[order.orderType ?? ''] ?? order.orderType ?? '-',
            width: 17,
          },
          {
            key: 'packageName',
            header: '课包名称',
            value: (order) =>
              order.package?.name ??
              (order.orderType === 'seat_reservation' ? '试听席位保留费' : '自定义课时'),
            width: 24,
          },
          {
            key: 'billingType',
            header: '课包类型',
            value: (order) => packageBillingLabel(order),
            width: 18,
          },
          {
            key: 'courseSeries',
            header: '课程系列',
            value: (order) => order.courseSeries?.name ?? '-',
            width: 20,
          },
          {
            key: 'course',
            header: '课程',
            value: (order) => order.course?.name ?? '-',
            width: 20,
          },
          {
            key: 'packagePrice',
            header: '课包标价',
            value: (order) => (order.package ? order.package.priceAmount / 100 : null),
            width: 14,
            format: 'currency',
          },
          {
            key: 'packageSalePrice',
            header: '课包优惠价',
            value: (order) =>
              order.package
                ? (order.package.discountPriceAmount ?? order.package.priceAmount) / 100
                : null,
            width: 14,
            format: 'currency',
          },
          {
            key: 'lessonCount',
            header: '订单课时',
            value: (order) => order.lessonCount,
            width: 12,
            format: 'integer',
          },
          {
            key: 'giftedLessons',
            header: '课包赠送课时',
            value: (order) => order.package?.giftedLessonCount ?? 0,
            width: 14,
            format: 'integer',
          },
          {
            key: 'student',
            header: '学员姓名',
            value: (order) => order.student?.name ?? '-',
            width: 14,
          },
          {
            key: 'grade',
            header: '年级 / 年龄',
            value: (order) => order.student?.grade ?? '-',
            width: 14,
          },
          {
            key: 'school',
            header: '学校',
            value: (order) => order.student?.school ?? '-',
            width: 20,
          },
          {
            key: 'guardianName',
            header: '家长姓名',
            value: (order) => order.student?.guardian?.name ?? '-',
            width: 14,
          },
          {
            key: 'guardianPhone',
            header: '家长手机号',
            value: (order) => order.student?.guardian?.phone ?? '-',
            width: 18,
            format: 'text',
          },
          {
            key: 'amount',
            header: '应收金额',
            value: (order) => order.amount / 100,
            width: 14,
            format: 'currency',
          },
          {
            key: 'paidAmount',
            header: '实收金额',
            value: (order) => order.paidAmount / 100,
            width: 14,
            format: 'currency',
          },
          {
            key: 'refundAmount',
            header: '已退款金额',
            value: (order) => approvedRefundAmount(order) / 100,
            width: 14,
            format: 'currency',
          },
          {
            key: 'paymentMethod',
            header: '支付方式',
            value: (order) =>
              order.paymentMethod
                ? (PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod)
                : '-',
            width: 15,
          },
          {
            key: 'paymentProvider',
            header: '支付渠道',
            value: (order) => order.paymentProvider ?? '-',
            width: 15,
          },
          {
            key: 'receiverName',
            header: '收款方',
            value: (order) => receiverName(order),
            width: 22,
          },
          {
            key: 'receiverType',
            header: '收款方类型',
            value: (order) =>
              PAYMENT_RECEIVER_TYPE_LABEL[receiverType(order)] ?? receiverType(order),
            width: 17,
          },
          {
            key: 'orderStatus',
            header: '订单状态',
            value: (order) => ORDER_STATUS_LABEL[order.status] ?? order.status,
            width: 13,
            alignment: 'center',
          },
          {
            key: 'settlementStatus',
            header: '结算状态',
            value: (order) => settlementStatusLabel(order, settledOrderIds),
            width: 13,
            alignment: 'center',
          },
          {
            key: 'source',
            header: '订单来源',
            value: (order) => order.source ?? '-',
            width: 16,
          },
          {
            key: 'channel',
            header: '归因渠道',
            value: (order) => order.channel?.name ?? '-',
            width: 18,
          },
          {
            key: 'campaign',
            header: '归因活动',
            value: (order) => order.campaign?.name ?? '-',
            width: 20,
          },
          {
            key: 'medium',
            header: '媒介',
            value: (order) => order.medium ?? '-',
            width: 14,
          },
          {
            key: 'paidAt',
            header: '支付时间',
            value: (order) => (order.paidAt ? new Date(order.paidAt) : null),
            width: 19,
            format: 'datetime',
            alignment: 'center',
          },
          {
            key: 'createdAt',
            header: '下单时间',
            value: (order) => new Date(order.createdAt),
            width: 19,
            format: 'datetime',
            alignment: 'center',
          },
          {
            key: 'note',
            header: '收款备注',
            value: (order) => order.offlinePaymentNote ?? '-',
            width: 30,
          },
        ],
      });
      toast.success(`已导出 ${settlementOrderDetails.length} 条订单明细`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(null);
    }
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
          <button
            type="button"
            className="btn btn-secondary"
            onClick={exportReceiverSettlement}
            disabled={exporting !== null || receiverSettlement.length === 0}
          >
            <Download className="h-4 w-4" />
            {exporting === 'summary' ? '导出中...' : '导出汇总'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={exportSettlementOrderDetails}
            disabled={exporting !== null || settlementOrderDetails.length === 0}
          >
            <Download className="h-4 w-4" />
            {exporting === 'details' ? '导出中...' : '导出明细'}
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
          {
            key: 'package',
            header: '课包',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">
                  {row.package?.name ??
                    (row.orderType === 'seat_reservation' ? '试听席位保留费' : '自定义课时')}
                </span>
                <span className="cell-subtitle">{packageBillingLabel(row)}</span>
              </div>
            ),
          },
          { key: 'student', header: '学员', cell: (row) => row.student?.name ?? '-' },
          {
            key: 'amounts',
            header: '应收 / 实收',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{money(row.amount)}</span>
                <span className="cell-subtitle">实收 {money(row.paidAmount)}</span>
              </div>
            ),
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
