import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Eye } from 'lucide-react';

import { api, apiPost } from '@/api/client';
import type { Course, CoursePackage, Order, Student } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { MetricCard } from '@/components/shared/MetricCard';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { money } from '@/lib/utils';
import { useApiResource } from '@/lib/useApiResource';

const ORDER_TYPE_LABEL: Record<string, string> = {
  package_purchase: '线上课时包',
  manual_package_grant: '线下添加课时包',
  seat_reservation: '试听席位保留费',
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: '待支付',
  paid: '已支付',
  refunded: '已退款',
  cancelled: '已取消',
};

const ORDER_CANCEL_REASON_LABEL: Record<string, string> = {
  user_cancel: '用户取消',
  system_cancel: '系统取消',
  admin_invalid: '管理员标记无效',
  test_order: '测试订单',
  duplicate: '重复订单',
  other: '其他',
};

const REFUND_STATUS_LABEL: Record<string, string> = {
  pending: '退款待审',
  approved: '退款通过',
  rejected: '退款拒绝',
  cancelled: '退款取消',
};

const REFUND_REASON_LABEL: Record<string, string> = {
  schedule_conflict: '时间冲突',
  course_not_fit: '课程不合适',
  duplicate_payment: '重复支付',
  service_issue: '服务问题',
  other: '其他原因',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  wechat_pay: '微信支付',
  alipay: '支付宝',
  mock: '模拟支付',
  cash: '现金',
  bank_transfer: '银行转账',
  wechat_offline: '微信线下',
  alipay_offline: '支付宝线下',
  offline_other: '其他线下',
};

const LIVE_PAYMENT_PROVIDER_LABEL: Record<string, string> = {
  wechat_pay: '微信支付',
  alipay: '支付宝',
};

const PAYMENT_RECEIVER_TYPE_LABEL: Record<string, string> = {
  platform: '平台收款',
  provider: '课程提供方收款',
  other: '其他收款方',
};

const ORDER_TYPE_OPTIONS = [
  { value: 'package_purchase', label: ORDER_TYPE_LABEL.package_purchase },
  { value: 'manual_package_grant', label: ORDER_TYPE_LABEL.manual_package_grant },
  { value: 'seat_reservation', label: ORDER_TYPE_LABEL.seat_reservation },
];

const ORDER_STATUS_OPTIONS = [
  { value: 'pending', label: ORDER_STATUS_LABEL.pending },
  { value: 'paid', label: ORDER_STATUS_LABEL.paid },
  { value: 'refunded', label: ORDER_STATUS_LABEL.refunded },
  { value: 'cancelled', label: ORDER_STATUS_LABEL.cancelled },
];

const PAYMENT_RECEIVER_TYPE_OPTIONS = [
  { value: 'platform', label: PAYMENT_RECEIVER_TYPE_LABEL.platform },
  { value: 'provider', label: PAYMENT_RECEIVER_TYPE_LABEL.provider },
  { value: 'other', label: PAYMENT_RECEIVER_TYPE_LABEL.other },
];

function orderSearchText(order: Order) {
  return [
    order.orderNo,
    order.student?.name,
    order.course?.name,
    order.package?.name,
    order.paymentReceiverName,
    order.paymentProvider ? LIVE_PAYMENT_PROVIDER_LABEL[order.paymentProvider] : '',
    order.paymentMethod ? PAYMENT_METHOD_LABEL[order.paymentMethod] : '',
    order.offlinePaymentNote,
    ...(order.refundRequests ?? []).map((refund) =>
      [REFUND_STATUS_LABEL[refund.status], REFUND_REASON_LABEL[refund.reason], refund.buyerNote]
        .filter(Boolean)
        .join(' '),
    ),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function paymentChannelLabel(order: Order) {
  if (order.paymentProvider) {
    return LIVE_PAYMENT_PROVIDER_LABEL[order.paymentProvider] ?? order.paymentProvider;
  }
  return order.paymentMethod
    ? (PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod)
    : '-';
}

function canSyncPayment(order: Order) {
  return (
    order.status === 'pending' &&
    Boolean(order.paymentProvider && LIVE_PAYMENT_PROVIDER_LABEL[order.paymentProvider])
  );
}

function pendingRefund(order: Order) {
  return order.refundRequests?.find((refund) => refund.status === 'pending') ?? null;
}

function effectivePackagePrice(coursePackage: CoursePackage) {
  return coursePackage.discountPriceAmount ?? coursePackage.priceAmount;
}

function effectivePackageLessonCount(coursePackage: CoursePackage) {
  return coursePackage.lessonCount + (coursePackage.giftedLessonCount ?? 0);
}

function packageLessonLabel(coursePackage: CoursePackage) {
  return coursePackage.giftedLessonCount
    ? `${coursePackage.lessonCount} + 赠 ${coursePackage.giftedLessonCount} 节`
    : `${coursePackage.lessonCount} 节`;
}

export function OrdersPage() {
  const toast = useToast();
  const { data, setData } = useApiResource<Order>('/v1/orders', 'orders');
  const { data: students } = useApiResource<Student>('/v1/students', 'students');
  const { data: courses } = useApiResource<Course>('/v1/courses', 'courses');
  const { data: packages } = useApiResource<CoursePackage>('/v1/course-packages', 'coursePackages');
  const activePackages = useMemo(
    () => packages.filter((coursePackage) => coursePackage.status === 'active'),
    [packages],
  );

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    studentId: '',
    packageId: '',
    courseId: '',
    paidYuan: '',
    paymentMethod: 'wechat_offline',
    offlinePaymentNote: '',
  });
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [receiverTypeFilter, setReceiverTypeFilter] = useState('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [syncingOrderNo, setSyncingOrderNo] = useState('');
  const [decidingRefundId, setDecidingRefundId] = useState('');
  const [reloading, setReloading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [cancelling, setCancelling] = useState(false);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  const selectedPackage = activePackages.find((item) => item.id === form.packageId);
  const selectableCourses = selectedPackage?.courseSeriesId
    ? courses.filter((course) => course.courseSeriesId === selectedPackage.courseSeriesId)
    : courses;
  const paymentMethods = useMemo(
    () =>
      Array.from(
        new Set(
          data
            .map((order) => order.paymentProvider || order.paymentMethod)
            .filter(Boolean) as string[],
        ),
      )
        .sort()
        .map((method) => ({
          value: method,
          label: LIVE_PAYMENT_PROVIDER_LABEL[method] ?? PAYMENT_METHOD_LABEL[method] ?? method,
        })),
    [data],
  );
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data.filter((order) => {
      if (typeFilter !== 'all' && order.orderType !== typeFilter) return false;
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      if (receiverTypeFilter !== 'all' && order.paymentReceiverType !== receiverTypeFilter) {
        return false;
      }
      if (
        paymentMethodFilter !== 'all' &&
        order.paymentMethod !== paymentMethodFilter &&
        order.paymentProvider !== paymentMethodFilter
      ) {
        return false;
      }
      if (normalizedQuery && !orderSearchText(order).includes(normalizedQuery)) return false;
      return true;
    });
  }, [data, paymentMethodFilter, query, receiverTypeFilter, statusFilter, typeFilter]);

  const summary = useMemo(() => {
    const paidOrders = filtered.filter((order) => order.status === 'paid');
    const pendingOrders = filtered.filter((order) => order.status === 'pending');
    return {
      paidAmount: paidOrders.reduce((sum, order) => sum + order.paidAmount, 0),
      pendingAmount: pendingOrders.reduce((sum, order) => sum + order.amount, 0),
      seatReservationAmount: filtered
        .filter((order) => order.orderType === 'seat_reservation')
        .reduce(
          (sum, order) => sum + (order.status === 'paid' ? order.paidAmount : order.amount),
          0,
        ),
      manualGrantCount: filtered.filter((order) => order.orderType === 'manual_package_grant')
        .length,
      pendingRefundCount: filtered.filter((order) => pendingRefund(order)).length,
    };
  }, [filtered]);

  const reloadOrders = useCallback(async () => {
    setReloading(true);
    try {
      const payload = await api<{ orders: Order[] }>('/v1/orders');
      setData(payload.orders ?? []);
    } finally {
      setReloading(false);
    }
  }, [setData]);

  const hasPendingProviderOrders = useMemo(
    () => data.some((order) => order.status === 'pending' && Boolean(order.paymentProvider)),
    [data],
  );

  useEffect(() => {
    if (!hasPendingProviderOrders) return;
    const timer = window.setInterval(() => {
      void reloadOrders().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasPendingProviderOrders, reloadOrders]);

  function openManualGrant() {
    const firstPackage = activePackages[0];
    setForm({
      studentId: students[0]?.id ?? '',
      packageId: firstPackage?.id ?? '',
      courseId: firstPackage?.courseId ?? '',
      paidYuan: firstPackage ? String(effectivePackagePrice(firstPackage) / 100) : '',
      paymentMethod: 'wechat_offline',
      offlinePaymentNote: '',
    });
    setOpen(true);
  }

  async function submitManualGrant() {
    if (!form.studentId || !form.packageId) {
      toast.error('请选择学员和课时包');
      return;
    }
    setSaving(true);
    try {
      const { order } = await apiPost<{ order: Order }>('/v1/orders/manual-package-grants', {
        studentId: form.studentId,
        packageId: form.packageId,
        courseId: form.courseId || undefined,
        paidAmount: Math.round((Number(form.paidYuan) || 0) * 100),
        paymentMethod: form.paymentMethod,
        offlinePaymentNote: form.offlinePaymentNote.trim() || undefined,
      });
      setData([order, ...data]);
      toast.success('课时包已添加，课时余额已更新');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '添加失败');
    } finally {
      setSaving(false);
    }
  }

  async function syncPaymentOrder(order: Order) {
    if (!canSyncPayment(order)) {
      toast.error('该订单尚未发起线上支付，不能同步三方支付状态');
      return;
    }
    setSyncingOrderNo(order.orderNo);
    try {
      const result = await api<{
        changed: boolean;
        item: Order;
        reconciliation: { status: string; source: string; reason: string };
      }>(`/v1/orders/${encodeURIComponent(order.orderNo)}/payment-sync`, { method: 'POST' });
      await reloadOrders();
      toast.success(
        `${result.item.status === 'paid' ? '订单已同步为已支付' : '订单状态已同步'}：${result.reconciliation.reason}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncingOrderNo('');
    }
  }

  async function decideRefund(order: Order, decision: 'approve' | 'reject') {
    const refund = pendingRefund(order);
    if (!refund) {
      toast.error('该订单没有待审核退款申请');
      return;
    }

    const adminNote =
      decision === 'reject'
        ? window.prompt('请输入拒绝原因（家长可见）')?.trim()
        : window.prompt('请输入退款备注（可选，家长可见）')?.trim();
    if (decision === 'reject' && !adminNote) {
      toast.error('拒绝退款必须填写原因');
      return;
    }

    setDecidingRefundId(refund.id);
    try {
      await apiPost(`/v1/refunds/${encodeURIComponent(refund.id)}/decision`, {
        decision,
        adminNote: adminNote || undefined,
      });
      await reloadOrders();
      toast.success(decision === 'approve' ? '退款已通过，订单已回滚' : '退款已拒绝');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '退款审核失败');
    } finally {
      setDecidingRefundId('');
    }
  }

  async function submitCancelOrder() {
    if (!cancelTarget) return;
    if (!cancelReason) {
      toast.error('请选择作废原因');
      return;
    }

    setCancelling(true);
    try {
      await api(`/v1/orders/${encodeURIComponent(cancelTarget.id)}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: cancelReason }),
      });
      await reloadOrders();
      toast.success('订单已作废');
      setCancelTarget(null);
      setCancelReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '作废订单失败');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <PageFrame
      section="orders"
      actions={
        <div className="flex flex-wrap justify-end gap-2">
          <select
            className="form-input w-auto py-1.5"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="all">全部类型</option>
            {ORDER_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="form-input w-auto py-1.5"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">全部状态</option>
            {ORDER_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="form-input w-auto py-1.5"
            value={receiverTypeFilter}
            onChange={(event) => setReceiverTypeFilter(event.target.value)}
          >
            <option value="all">全部收款方</option>
            {PAYMENT_RECEIVER_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="form-input w-auto py-1.5"
            value={paymentMethodFilter}
            onChange={(event) => setPaymentMethodFilter(event.target.value)}
          >
            <option value="all">全部支付方式</option>
            {paymentMethods.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            className="form-input w-52 py-1.5"
            placeholder="搜索订单/学员/课程/收款方"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void reloadOrders().catch(() => toast.error('刷新订单失败'))}
            disabled={reloading}
          >
            <RefreshCw className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button type="button" className="btn btn-primary" onClick={openManualGrant}>
            <Plus className="h-4 w-4" />
            线下添加课时包
          </button>
        </div>
      }
    >
      <div className="metric-grid mb-6">
        <MetricCard label="筛选订单" value={filtered.length} hint={`全部 ${data.length} 笔`} />
        <MetricCard label="已收金额" value={money(summary.paidAmount)} hint="筛选范围内已支付" />
        <MetricCard label="待收金额" value={money(summary.pendingAmount)} hint="筛选范围内待支付" />
        <MetricCard
          label="占位费订单"
          value={money(summary.seatReservationAmount)}
          hint={`${summary.manualGrantCount} 笔线下课时包添加`}
        />
        <MetricCard label="待审退款" value={summary.pendingRefundCount} hint="筛选范围内退款申请" />
      </div>

      <DataTable
        columns={[
          { key: 'orderNo', header: '订单号', cell: (row) => row.orderNo },
          {
            key: 'type',
            header: '类型',
            cell: (row) => ORDER_TYPE_LABEL[row.orderType ?? ''] ?? row.orderType ?? '-',
          },
          { key: 'student', header: '学员', cell: (row) => row.student?.name ?? '-' },
          { key: 'course', header: '课程', cell: (row) => row.course?.name ?? '-' },
          { key: 'package', header: '课时包', cell: (row) => row.package?.name ?? '-' },
          { key: 'amount', header: '实收', cell: (row) => money(row.paidAmount) },
          { key: 'lessons', header: '课时', cell: (row) => `${row.lessonCount} 节` },
          {
            key: 'receiver',
            header: '收款方',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.paymentReceiverName ?? '-'}</span>
                <span className="cell-subtitle">
                  {row.paymentReceiverType
                    ? (PAYMENT_RECEIVER_TYPE_LABEL[row.paymentReceiverType] ??
                      row.paymentReceiverType)
                    : '-'}
                </span>
              </div>
            ),
          },
          {
            key: 'method',
            header: '支付方式',
            cell: (row) => paymentChannelLabel(row),
          },
          {
            key: 'status',
            header: '状态',
            cell: (row) => (
              <div className="cell-stack">
                <StatusPill tone={statusToTone(row.status)} label={row.status} />
                {row.refundRequests?.[0] ? (
                  <span className="cell-subtitle">
                    {REFUND_STATUS_LABEL[row.refundRequests[0].status] ??
                      row.refundRequests[0].status}
                    {' · '}
                    {REFUND_REASON_LABEL[row.refundRequests[0].reason] ??
                      row.refundRequests[0].reason}
                  </span>
                ) : null}
              </div>
            ),
          },
          {
            key: 'actions',
            header: '操作',
            cell: (row) => {
              const refund = pendingRefund(row);
              const canCancel = row.status === 'pending' || row.status === 'paid';
              return (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="btn btn-secondary px-2 py-1 text-xs"
                    onClick={() => setDetailOrder(row)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    详情
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary px-2 py-1 text-xs"
                    onClick={() => void syncPaymentOrder(row)}
                    disabled={!canSyncPayment(row) || syncingOrderNo === row.orderNo}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${syncingOrderNo === row.orderNo ? 'animate-spin' : ''}`}
                    />
                    {syncingOrderNo === row.orderNo ? '同步中' : '同步'}
                  </button>
                  {refund ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary px-2 py-1 text-xs"
                        onClick={() => void decideRefund(row, 'approve')}
                        disabled={decidingRefundId === refund.id}
                      >
                        通过退款
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary px-2 py-1 text-xs"
                        onClick={() => void decideRefund(row, 'reject')}
                        disabled={decidingRefundId === refund.id}
                      >
                        拒绝
                      </button>
                    </>
                  ) : null}
                  {canCancel && (
                    <button
                      type="button"
                      className="btn btn-ghost px-2 py-1 text-xs text-red-600"
                      onClick={() => {
                        setCancelTarget(row);
                        setCancelReason('');
                      }}
                    >
                      作废
                    </button>
                  )}
                </div>
              );
            },
          },
        ]}
        data={filtered}
        emptyMessage="没有符合筛选条件的订单。"
      />

      <Drawer
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="作废订单"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCancelTarget(null)}
              disabled={cancelling}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitCancelOrder}
              disabled={!cancelReason || cancelling}
            >
              {cancelling ? '作废中...' : '确认作废'}
            </button>
          </>
        }
      >
        <Field label="订单号">
          <input
            className="form-input"
            value={cancelTarget?.orderNo || ''}
            readOnly
          />
        </Field>
        <Field label="学员">
          <input
            className="form-input"
            value={cancelTarget?.student?.name || ''}
            readOnly
          />
        </Field>
        <Field label="作废原因" required>
          <select
            className="form-input"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
          >
            <option value="">选择原因...</option>
            <option value="test_order">测试订单</option>
            <option value="admin_invalid">管理员标记无效</option>
            <option value="duplicate">重复订单</option>
            <option value="system_cancel">系统取消</option>
            <option value="other">其他</option>
          </select>
        </Field>
      </Drawer>

      <Drawer
        open={Boolean(detailOrder)}
        onClose={() => setDetailOrder(null)}
        title={`订单详情 - ${detailOrder?.orderNo}`}
      >
        {detailOrder && (
          <div className="space-y-4">
            <section className="resource-card p-4">
              <h3 className="mb-3 text-sm font-semibold">基本信息</h3>
              <div className="grid grid-cols-2 gap-y-3 text-sm">
                <span className="text-muted-foreground">订单号</span>
                <span className="font-mono">{detailOrder.orderNo}</span>
                <span className="text-muted-foreground">订单类型</span>
                <span>{ORDER_TYPE_LABEL[detailOrder.orderType ?? ''] ?? detailOrder.orderType ?? '-'}</span>
                <span className="text-muted-foreground">订单状态</span>
                <span>
                  <StatusPill tone={statusToTone(detailOrder.status)} label={detailOrder.status} />
                </span>
                <span className="text-muted-foreground">创建时间</span>
                <span>{new Date(detailOrder.createdAt).toLocaleString('zh-CN')}</span>
              </div>
            </section>

            <section className="resource-card p-4">
              <h3 className="mb-3 text-sm font-semibold">学员信息</h3>
              <div className="grid grid-cols-2 gap-y-3 text-sm">
                <span className="text-muted-foreground">学员</span>
                <span>{detailOrder.student?.name ?? '-'}</span>
                <span className="text-muted-foreground">课程</span>
                <span>{detailOrder.course?.name ?? '-'}</span>
              </div>
            </section>

            <section className="resource-card p-4">
              <h3 className="mb-3 text-sm font-semibold">课时信息</h3>
              <div className="grid grid-cols-2 gap-y-3 text-sm">
                <span className="text-muted-foreground">课时包</span>
                <span>{detailOrder.package?.name ?? '-'}</span>
                <span className="text-muted-foreground">课时数</span>
                <span>{detailOrder.lessonCount} 节</span>
              </div>
            </section>

            <section className="resource-card p-4">
              <h3 className="mb-3 text-sm font-semibold">费用信息</h3>
              <div className="grid grid-cols-2 gap-y-3 text-sm">
                <span className="text-muted-foreground">应收金额</span>
                <span>{money(detailOrder.amount)}</span>
                <span className="text-muted-foreground">实收金额</span>
                <span>{money(detailOrder.paidAmount)}</span>
                <span className="text-muted-foreground">支付方式</span>
                <span>{paymentChannelLabel(detailOrder)}</span>
              </div>
            </section>

            <section className="resource-card p-4">
              <h3 className="mb-3 text-sm font-semibold">收款方</h3>
              <div className="grid grid-cols-2 gap-y-3 text-sm">
                <span className="text-muted-foreground">收款方类型</span>
                <span>{PAYMENT_RECEIVER_TYPE_LABEL[detailOrder.paymentReceiverType ?? ''] ?? detailOrder.paymentReceiverType ?? '-'}</span>
                <span className="text-muted-foreground">收款方名称</span>
                <span>{detailOrder.paymentReceiverName ?? '-'}</span>
              </div>
            </section>

            {(detailOrder.status === 'cancelled' && detailOrder.cancelReason) && (
              <section className="resource-card p-4">
                <h3 className="mb-3 text-sm font-semibold">作废信息</h3>
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  <span className="text-muted-foreground">作废原因</span>
                  <span>{ORDER_CANCEL_REASON_LABEL[detailOrder.cancelReason] ?? detailOrder.cancelReason}</span>
                  <span className="text-muted-foreground">作废时间</span>
                  <span>{detailOrder.cancelledAt ? new Date(detailOrder.cancelledAt).toLocaleString('zh-CN') : '-'}</span>
                </div>
              </section>
            )}

            {detailOrder.refundRequests && detailOrder.refundRequests.length > 0 && (
              <section className="resource-card p-4">
                <h3 className="mb-3 text-sm font-semibold">退款信息</h3>
                {detailOrder.refundRequests.map((refund) => (
                  <div key={refund.id} className="mb-3 space-y-2 rounded-md bg-slate-50 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">退款状态</span>
                      <span>{REFUND_STATUS_LABEL[refund.status] ?? refund.status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">退款原因</span>
                      <span>{REFUND_REASON_LABEL[refund.reason] ?? refund.reason}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">退款金额</span>
                      <span>{money(refund.amount)}</span>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </Drawer>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="线下添加课时包"
        description="线下确认收款后，为学员添加课时并生成可追溯订单。"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitManualGrant}
              disabled={saving}
            >
              {saving ? '添加中...' : '确认添加'}
            </button>
          </>
        }
      >
        <Field label="学员" required>
          <select
            className="form-input"
            value={form.studentId}
            onChange={(event) => setForm({ ...form, studentId: event.target.value })}
          >
            <option value="">选择学员</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name} · {student.grade}
              </option>
            ))}
          </select>
        </Field>
        <Field label="课时包" required>
          <select
            className="form-input"
            value={form.packageId}
            onChange={(event) => {
              const coursePackage = activePackages.find((item) => item.id === event.target.value);
              setForm({
                ...form,
                packageId: event.target.value,
                courseId: coursePackage?.courseId ?? '',
                paidYuan: coursePackage
                  ? String(effectivePackagePrice(coursePackage) / 100)
                  : form.paidYuan,
              });
            }}
          >
            <option value="">选择课时包</option>
            {activePackages.map((coursePackage) => (
              <option key={coursePackage.id} value={coursePackage.id}>
                {coursePackage.name} · {packageLessonLabel(coursePackage)} ·{' '}
                {money(effectivePackagePrice(coursePackage))}
              </option>
            ))}
          </select>
        </Field>
        {selectedPackage?.courseSeriesId ? (
          <Field label="落账课程" required hint="系列课时包需选择本次先计入哪个课程账户">
            <select
              className="form-input"
              value={form.courseId}
              onChange={(event) => setForm({ ...form, courseId: event.target.value })}
            >
              <option value="">选择课程</option>
              {selectableCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {selectedPackage && (
          <div className="text-muted-foreground rounded-lg bg-slate-50 px-3 py-2 text-sm">
            系统将添加 {effectivePackageLessonCount(selectedPackage)} 节课时，课时包展示价{' '}
            {money(effectivePackagePrice(selectedPackage))}
            {selectedPackage.discountPriceAmount !== null &&
            selectedPackage.discountPriceAmount !== undefined
              ? `（原价 ${money(selectedPackage.priceAmount)}）`
              : ''}
            。
          </div>
        )}
        <FieldRow>
          <Field label="线下实收(元)">
            <input
              className="form-input"
              type="number"
              value={form.paidYuan}
              onChange={(event) => setForm({ ...form, paidYuan: event.target.value })}
            />
          </Field>
          <Field label="支付方式">
            <select
              className="form-input"
              value={form.paymentMethod}
              onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}
            >
              <option value="wechat_offline">微信线下</option>
              <option value="alipay_offline">支付宝线下</option>
              <option value="bank_transfer">银行转账</option>
              <option value="cash">现金</option>
              <option value="offline_other">其他线下</option>
            </select>
          </Field>
        </FieldRow>
        <Field label="备注">
          <textarea
            className="form-input h-20"
            value={form.offlinePaymentNote}
            onChange={(event) => setForm({ ...form, offlinePaymentNote: event.target.value })}
          />
        </Field>
      </Drawer>
    </PageFrame>
  );
}
