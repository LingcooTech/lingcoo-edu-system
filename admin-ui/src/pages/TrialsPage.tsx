import type { TrialSession } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { tenantId } from '@/lib/foundation';
import { formatDateTime } from '@/lib/utils';
import { useApiResource } from '@/lib/useApiResource';

export function TrialsPage() {
  const { data } = useApiResource<TrialSession>(
    `/v1/tenants/${tenantId}/trial-sessions`,
    'trialSessions',
  );

  return (
    <PageFrame section="trials">
      <DataTable
        columns={[
          { key: 'title', header: '公开课', cell: (row) => row.title },
          { key: 'time', header: '时间', cell: (row) => formatDateTime(row.startsAt) },
          { key: 'capacity', header: '报名', cell: (row) => `${row.bookedCount}/${row.capacity}` },
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
