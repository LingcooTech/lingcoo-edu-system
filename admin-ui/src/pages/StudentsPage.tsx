import type { Student } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { tenantId } from '@/lib/foundation';
import { useApiResource } from '@/lib/useApiResource';

export function StudentsPage() {
  const { data } = useApiResource<Student>(`/v1/tenants/${tenantId}/students`, 'students');

  return (
    <PageFrame section="students">
      <DataTable
        columns={[
          {
            key: 'name',
            header: '学员',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.name}</span>
                <span className="cell-subtitle">{row.grade}</span>
              </div>
            ),
          },
          {
            key: 'guardian',
            header: '家长',
            cell: (row) => `${row.guardian?.name ?? '-'} ${row.guardian?.phone ?? ''}`,
          },
          {
            key: 'lesson',
            header: '课时余额',
            cell: (row) => row.lessonAccounts?.map((account) => account.balance).join(' / ') || '0',
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
