import { api } from '@/api/client';
import type { Lead, LeadStatus } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { tenantId } from '@/lib/foundation';
import { useApiResource } from '@/lib/useApiResource';

const statusOptions: LeadStatus[] = [
  'new',
  'contacted',
  'trial_booked',
  'trial_attended',
  'paid',
  'follow_up',
  'invalid',
];

export function LeadsPage() {
  const { data, setData } = useApiResource<Lead>(`/v1/tenants/${tenantId}/leads`, 'leads');

  async function updateStatus(lead: Lead, status: LeadStatus) {
    const payload = await api<{ lead: Lead }>(`/v1/tenants/${tenantId}/leads/${lead.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    setData(data.map((item) => (item.id === lead.id ? payload.lead : item)));
  }

  return (
    <PageFrame section="leads">
      <DataTable
        columns={[
          {
            key: 'student',
            header: '学员 / 家长',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.studentName}</span>
                <span className="cell-subtitle">
                  {row.guardianName} · {row.phone}
                </span>
              </div>
            ),
          },
          { key: 'grade', header: '年级', cell: (row) => row.grade },
          { key: 'source', header: '来源', cell: (row) => row.source },
          {
            key: 'status',
            header: '状态',
            cell: (row) => <StatusPill tone={statusToTone(row.status)} label={row.status} />,
          },
          {
            key: 'action',
            header: '流转',
            cell: (row) => (
              <select
                className="rounded-lg border px-2 py-1 text-sm"
                value={row.status}
                onChange={(event) => updateStatus(row, event.target.value as LeadStatus)}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            ),
          },
        ]}
        data={data}
      />
    </PageFrame>
  );
}
