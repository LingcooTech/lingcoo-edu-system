import { useEffect, useState } from 'react';

import { api } from '@/api/client';
import { PageFrame } from '@/components/layout/PageFrame';
import { MetricCard } from '@/components/shared/MetricCard';
import { DataTable } from '@/components/shared/DataTable';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { tenantId } from '@/lib/foundation';
import { formatDateTime, money } from '@/lib/utils';
import type { ClassSession } from '@/api/types';

interface DashboardPayload {
  metrics: {
    totalLeads: number;
    pendingFollowUps: number;
    bookedTrials: number;
    paidStudents: number;
    monthlyRevenue: number;
    lowLessonAccounts: number;
    attributedLeads: number;
    activeCampaigns: number;
  };
  todaySessions: ClassSession[];
}

export function DashboardPage() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);

  useEffect(() => {
    api<DashboardPayload>(`/v1/tenants/${tenantId}/dashboard`)
      .then(setPayload)
      .catch(console.error);
  }, []);

  return (
    <PageFrame section="dashboard">
      <div className="metric-grid">
        <MetricCard label="总线索" value={payload?.metrics.totalLeads ?? '-'} />
        <MetricCard label="待跟进" value={payload?.metrics.pendingFollowUps ?? '-'} />
        <MetricCard label="已预约试听" value={payload?.metrics.bookedTrials ?? '-'} />
        <MetricCard label="归因线索" value={payload?.metrics.attributedLeads ?? '-'} />
        <MetricCard label="投放活动" value={payload?.metrics.activeCampaigns ?? '-'} />
        <MetricCard
          label="本月收入"
          value={payload ? money(payload.metrics.monthlyRevenue) : '-'}
        />
      </div>
      <div className="mt-5">
        <DataTable
          columns={[
            { key: 'time', header: '时间', cell: (row) => formatDateTime(row.startsAt) },
            {
              key: 'topic',
              header: '课次',
              cell: (row) => (
                <div className="cell-stack">
                  <span className="cell-title">{row.topic}</span>
                  <span className="cell-subtitle">{row.class?.name ?? row.id}</span>
                </div>
              ),
            },
            {
              key: 'status',
              header: '状态',
              cell: (row) => <StatusPill tone={statusToTone(row.status)} label={row.status} />,
            },
          ]}
          data={payload?.todaySessions ?? []}
          emptyMessage="暂无今日课程"
        />
      </div>
    </PageFrame>
  );
}
