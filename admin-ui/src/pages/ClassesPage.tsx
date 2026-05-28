import type { ClassGroup } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { tenantId } from '@/lib/foundation';
import { useApiResource } from '@/lib/useApiResource';

export function ClassesPage() {
  const { data } = useApiResource<ClassGroup>(`/v1/tenants/${tenantId}/classes`, 'classes');

  return (
    <PageFrame section="classes">
      <DataTable
        columns={[
          {
            key: 'name',
            header: '班级',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.name}</span>
                <span className="cell-subtitle">{row.course?.name}</span>
              </div>
            ),
          },
          { key: 'teacher', header: '老师', cell: (row) => row.teacher?.name ?? '-' },
          { key: 'room', header: '教室', cell: (row) => row.classroom?.name ?? '-' },
          {
            key: 'capacity',
            header: '人数',
            cell: (row) => `${row.enrolledCount}/${row.capacity}`,
          },
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
