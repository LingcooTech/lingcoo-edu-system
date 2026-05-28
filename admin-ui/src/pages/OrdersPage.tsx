import type { Order } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { tenantId } from '@/lib/foundation';
import { money } from '@/lib/utils';
import { useApiResource } from '@/lib/useApiResource';

export function OrdersPage() {
  const { data } = useApiResource<Order>(`/v1/tenants/${tenantId}/orders`, 'orders');

  return (
    <PageFrame section="orders">
      <DataTable
        columns={[
          { key: 'orderNo', header: '订单号', cell: (row) => row.orderNo },
          { key: 'student', header: '学员', cell: (row) => row.student?.name ?? '-' },
          { key: 'course', header: '课程', cell: (row) => row.course?.name ?? '-' },
          { key: 'amount', header: '实收', cell: (row) => money(row.paidAmount) },
          { key: 'lessons', header: '课时', cell: (row) => `${row.lessonCount} 节` },
          {
            key: 'status',
            header: '状态',
            cell: (row) => <StatusPill tone={statusToTone(row.status)} label={row.status} />,
          },
        ]}
        data={data}
      />
    </PageFrame>
  );
}
