import { useEffect, useState } from 'react';

import { api } from '@/api/client';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { tenantId } from '@/lib/foundation';

interface SourceRow {
  source: string;
  name: string;
  leads: number;
  paid: number;
}

export function MarketingPage() {
  const [rows, setRows] = useState<SourceRow[]>([]);

  useEffect(() => {
    api<{ bySource: SourceRow[] }>(`/v1/tenants/${tenantId}/reports/funnel`)
      .then((payload) => setRows(payload.bySource))
      .catch(console.error);
  }, []);

  return (
    <PageFrame section="marketing">
      <DataTable
        columns={[
          { key: 'name', header: '渠道', cell: (row) => row.name },
          { key: 'source', header: '参数', cell: (row) => row.source },
          { key: 'leads', header: '线索数', cell: (row) => row.leads },
          { key: 'paid', header: '缴费数', cell: (row) => row.paid },
          {
            key: 'rate',
            header: '转化率',
            cell: (row) => (row.leads ? `${((row.paid / row.leads) * 100).toFixed(1)}%` : '0%'),
          },
        ]}
        data={rows}
      />
    </PageFrame>
  );
}
