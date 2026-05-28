import type { ClassSession } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { tenantId } from '@/lib/foundation';
import { formatDateTime } from '@/lib/utils';
import { useApiResource } from '@/lib/useApiResource';

export function SchedulePage() {
  const { data } = useApiResource<ClassSession>(
    `/v1/tenants/${tenantId}/class-sessions`,
    'classSessions',
  );

  return (
    <PageFrame section="schedule">
      <DataTable
        columns={[
          { key: 'time', header: '时间', cell: (row) => formatDateTime(row.startsAt) },
          {
            key: 'topic',
            header: '课次',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.topic}</span>
                <span className="cell-subtitle">{row.class?.name}</span>
              </div>
            ),
          },
          { key: 'teacher', header: '老师', cell: (row) => row.teacher?.name ?? '-' },
          { key: 'room', header: '教室', cell: (row) => row.classroom?.name ?? '-' },
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
