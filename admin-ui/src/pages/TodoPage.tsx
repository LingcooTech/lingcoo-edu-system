import { useMemo } from 'react';

import type { Lead, TrialSession } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { MetricCard } from '@/components/shared/MetricCard';
import { useApiResource } from '@/lib/useApiResource';
import { formatDateTime } from '@/lib/utils';

export function TodoPage() {
  const { data: leads } = useApiResource<Lead>('/v1/crm/leads', 'leads');
  const { data: trialSessions } = useApiResource<TrialSession>(
    '/v1/trial-sessions',
    'trialSessions',
  );

  const pendingLeads = useMemo(
    () => leads.filter((lead) => ['new', 'contacted', 'follow_up'].includes(lead.status)),
    [leads],
  );
  const bookedTrials = useMemo(
    () => leads.filter((lead) => lead.status === 'trial_booked'),
    [leads],
  );
  const openTrials = useMemo(
    () => trialSessions.filter((session) => session.status === 'open'),
    [trialSessions],
  );

  return (
    <PageFrame section="todos">
      <div className="metric-grid">
        <MetricCard label="待联系/待跟进" value={pendingLeads.length} />
        <MetricCard label="待试听到店" value={bookedTrials.length} />
        <MetricCard label="开放试听场次" value={openTrials.length} />
      </div>

      <div className="mt-5">
        <DataTable
          columns={[
            {
              key: 'lead',
              header: '待办线索',
              cell: (row) => (
                <div className="cell-stack">
                  <span className="cell-title">{row.studentName}</span>
                  <span className="cell-subtitle">
                    {row.guardianName} · {row.phone}
                  </span>
                </div>
              ),
            },
            { key: 'status', header: '阶段', cell: (row) => row.status },
            {
              key: 'next',
              header: '下次跟进',
              cell: (row) => (row.nextFollowUpAt ? formatDateTime(row.nextFollowUpAt) : '-'),
            },
          ]}
          data={pendingLeads}
          emptyMessage="暂无待处理线索"
        />
      </div>
    </PageFrame>
  );
}
